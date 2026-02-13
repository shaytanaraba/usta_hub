/**
 * Dispatcher Dashboard - v5 Enhanced
 * Features: Queue with filters, Grid/List view, Details Drawer, Master Assignment,
 * Draft saving, Recent Addresses, Internal Notes
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    Modal, TextInput, ScrollView, ActivityIndicator, Alert, Platform,
    Dimensions, Linking, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ordersService, { ORDER_STATUS } from '../services/orders';
import authService from '../services/auth';
import partnerFinanceService from '../services/partnerFinance';
import { useToast } from '../contexts/ToastContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_COLORS, getOrderStatusLabel, getServiceLabel, getTimeAgo } from '../utils/orderHelpers';
import useDebouncedValue from './dispatcher/hooks/useDebouncedValue';
import useDispatcherPerf from './dispatcher/hooks/useDispatcherPerf';
import useDispatcherActions from './dispatcher/hooks/useDispatcherActions';
import useDispatcherDataLoader from './dispatcher/hooks/useDispatcherDataLoader';
import useDispatcherRouting from './dispatcher/hooks/useDispatcherRouting';
import useDispatcherUiState from './dispatcher/hooks/useDispatcherUiState';
import useDispatcherOrderActions from './dispatcher/hooks/useDispatcherOrderActions';
import {
    INITIAL_ORDER_STATE,
    DISPATCHER_TABS,
    PARTNER_TABS,
    SERVICE_TYPES,
    STORAGE_KEYS,
} from './dispatcher/constants';
import { generateIdempotencyKey, sanitizeNumberInput } from './dispatcher/utils/formHelpers';
import { normalizeKyrgyzPhone, isValidKyrgyzPhone } from '../utils/phone';
import DispatcherPickerModal from './dispatcher/components/DispatcherPickerModal';
import DispatcherSidebar from './dispatcher/components/DispatcherSidebar';
import DispatcherHeader from './dispatcher/components/DispatcherHeader';
import DispatcherCreateOrderTab from './dispatcher/components/tabs/DispatcherCreateOrderTab';
import DispatcherSettingsTab from './dispatcher/components/tabs/DispatcherSettingsTab';
import DispatcherQueueTab from './dispatcher/components/tabs/DispatcherQueueTab';
import DispatcherStatsTab from './dispatcher/components/tabs/DispatcherStatsTab';
import styles from './dispatcher/styles/dashboardStyles';
const LOG_PREFIX = '[DispatcherDashboard]';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_PAYMENT_CONFIRMATION_DATA = {
    finalAmount: '',
    reportReason: '',
    workPerformed: '',
    hoursWorked: '',
};
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const buildPaymentConfirmationData = (order) => {
    const finalAmountValue = order?.final_price ?? order?.initial_price;
    return {
        finalAmount: finalAmountValue !== null && finalAmountValue !== undefined && finalAmountValue !== ''
            ? String(finalAmountValue)
            : '',
        reportReason: '',
        workPerformed: String(order?.work_performed || ''),
        hoursWorked: order?.hours_worked !== null && order?.hours_worked !== undefined && order?.hours_worked !== ''
            ? String(order?.hours_worked)
            : '',
    };
};
const normalizeSearchTerm = (value) => String(value || '').trim().toLowerCase();
const normalizeSearchDigits = (value) => String(value || '').replace(/\D/g, '');
const matchesMasterSearch = (master, queryText) => {
    const query = normalizeSearchTerm(queryText);
    const digits = normalizeSearchDigits(queryText);
    if (!query && !digits) return true;
    const fullName = String(master?.full_name || master?.name || '').toLowerCase();
    const phone = String(master?.phone || '');
    const phoneDigits = normalizeSearchDigits(phone);
    const serviceArea = String(master?.service_area || '').toLowerCase();
    const haystack = `${fullName} ${phone.toLowerCase()} ${serviceArea}`;
    if (query && haystack.includes(query)) return true;
    if (!digits) return false;
    return phoneDigits.includes(digits);
};

export default function DispatcherDashboard({ navigation, route }) {
    const { showToast } = useToast();
    const { translations, language, cycleLanguage, setLanguage, t } = useLocalization();
    const TRANSLATIONS = translations;
    const { logout, user: authUser } = useAuth();
    const routeRole = route?.params?.user?.role || authUser?.role || null;
    const allowedTabs = useMemo(
        () => (routeRole === 'partner' ? PARTNER_TABS : DISPATCHER_TABS),
        [routeRole]
    );
    const perf = useDispatcherPerf();

    // User & Data
    const [user, setUser] = useState(route.params?.user || null);
    const isPartner = (user?.role || authUser?.role || route?.params?.user?.role) === 'partner';
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [dispatchers, setDispatchers] = useState([]);
    const [queueTotalCount, setQueueTotalCount] = useState(0);
    const [statusCounts, setStatusCounts] = useState({ Active: 0, Payment: 0, Confirmed: 0, Canceled: 0 });
    const [attentionOrders, setAttentionOrders] = useState([]);
    const [needsAttentionCount, setNeedsAttentionCount] = useState(0);
    const [statsSummary, setStatsSummary] = useState(null);
    const [recentAddresses, setRecentAddresses] = useState([]);
    const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES);
    const [districts, setDistricts] = useState([]);
    const [partnerFinanceSummary, setPartnerFinanceSummary] = useState(null);
    const [partnerPayoutRequests, setPartnerPayoutRequests] = useState([]);
    const [partnerTransactions, setPartnerTransactions] = useState([]);
    const [partnerFinanceLoading, setPartnerFinanceLoading] = useState(false);
    const [partnerPayoutAmount, setPartnerPayoutAmount] = useState('');
    const [partnerPayoutNote, setPartnerPayoutNote] = useState('');
    const [partnerPayoutComposerToken, setPartnerPayoutComposerToken] = useState(0);

    // UI States
    const { activeTab, setActiveTab } = useDispatcherRouting({ navigation, route, tabs: allowedTabs });
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDark, setIsDark] = useState(true); // Theme state
    const [actionLoading, setActionLoading] = useState(false);
    const [showAddMasterModal, setShowAddMasterModal] = useState(false);
    const [newMasterData, setNewMasterData] = useState({
        email: '',
        password: '',
        full_name: '',
        phone: '',
        service_area: '',
    });
    const [newMasterPhoneError, setNewMasterPhoneError] = useState('');
    const [page, setPage] = useState(1); // Pagination state
    const [statsTooltip, setStatsTooltip] = useState(null);
    const [statsInfo, setStatsInfo] = useState(null);
    const [statsGridWidth, setStatsGridWidth] = useState(0);
    const statsTooltipTimer = useRef(null);
    const assignMasterBaseRef = useRef([]);
    const assignMasterSearchReqRef = useRef(0);

    // Filters
    const [viewMode, setViewMode] = useState('compact');
    const [statusFilter, setStatusFilter] = useState('Active');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUrgency, setFilterUrgency] = useState('all');
    const [filterService, setFilterService] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');
    const [showFilters, setShowFilters] = useState(false);
    const [statsRange, setStatsRange] = useState('week');
    const [showNeedsAttention, setShowNeedsAttention] = useState(false);
    const [sortOrder, setSortOrder] = useState('newest');
    const [filterAttentionType, setFilterAttentionType] = useState('All');
    const [assignMasterSearchQuery, setAssignMasterSearchQuery] = useState('');
    const [assignMasterSearchLoading, setAssignMasterSearchLoading] = useState(false);

    const {
        pickerModal,
        showDatePicker,
        showTimePicker,
        detailsOrder,
        isEditing,
        editForm,
        showPaymentModal,
        paymentData,
        paymentOrder,
        showAssignModal,
        assignTarget,
        showMasterDetails,
        masterDetails,
        masterDetailsLoading,
        newOrder,
        phoneError,
        confirmChecked,
        creationSuccess,
        showRecentAddr,
        idempotencyKey,
        setPickerModal,
        setShowDatePicker,
        setShowTimePicker,
        setDetailsOrder,
        setIsEditing,
        setEditForm,
        setShowPaymentModal,
        setPaymentData,
        setPaymentOrder,
        setShowAssignModal,
        setAssignTarget,
        setShowMasterDetails,
        setMasterDetails,
        setMasterDetailsLoading,
        setNewOrder,
        setPhoneError,
        setConfirmChecked,
        setCreationSuccess,
        setShowRecentAddr,
        setIdempotencyKey,
    } = useDispatcherUiState({
        initialOrderState: INITIAL_ORDER_STATE,
        generateIdempotencyKey,
    });
    const [platformSettings, setPlatformSettings] = useState(null); // Dynamic platform settings
    const skeletonPulse = useRef(new Animated.Value(0.6)).current;
    const debouncedSearchQuery = useDebouncedValue(searchQuery, 220);
    const assignMasterSearchDebounced = useDebouncedValue(assignMasterSearchQuery, 220);
    const pageSize = viewMode === 'cards' ? 20 : 10;
    const queueQuery = useMemo(() => ({
        page,
        statusFilter,
        searchQuery: debouncedSearchQuery,
        filterUrgency,
        filterService,
        filterSort,
    }), [page, statusFilter, debouncedSearchQuery, filterUrgency, filterService, filterSort]);
    const queueFilterSignature = useMemo(
        () => JSON.stringify({
            statusFilter,
            searchQuery: debouncedSearchQuery,
            filterUrgency,
            filterService,
            filterSort,
        }),
        [statusFilter, debouncedSearchQuery, filterUrgency, filterService, filterSort]
    );
    const prevQueueFilterSignatureRef = useRef(queueFilterSignature);

    const {
        invalidateLoaders,
        loadQueueData,
        loadServiceTypes,
        loadDistricts,
        loadDispatchers,
        loadPlatformSettings,
        loadStatsSummary,
        loadMasters,
        onRefresh,
    } = useDispatcherDataLoader({
        authUser,
        language,
        queueQuery,
        pageSize,
        refreshing,
        setRefreshing,
        setLoading,
        setUser,
        setOrders,
        setQueueTotalCount,
        setStatusCounts,
        setAttentionOrders,
        setAttentionCount: setNeedsAttentionCount,
        setServiceTypes,
        setDistricts,
        setDispatchers,
        setPlatformSettings,
        setStatsSummary,
        perf,
    });

    const {
        patchOrderInState,
        removeOrderFromState,
        addOrderToState,
        scheduleBackgroundRefresh,
    } = useDispatcherActions({ setOrders, setDetailsOrder });

    const loadPartnerFinance = useCallback(async () => {
        const partnerId = user?.id || authUser?.id;
        if (!isPartner || !partnerId) {
            setPartnerFinanceSummary(null);
            setPartnerPayoutRequests([]);
            setPartnerTransactions([]);
            return null;
        }
        setPartnerFinanceLoading(true);
        try {
            const summary = await partnerFinanceService.getPartnerFinanceSummary(partnerId);
            setPartnerFinanceSummary(summary || null);
            setPartnerPayoutRequests(summary?.payoutRequests || []);
            setPartnerTransactions(summary?.transactions || []);
            return summary || null;
        } finally {
            setPartnerFinanceLoading(false);
        }
    }, [authUser?.id, isPartner, user?.id]);

    // ============================================
    // DATA LOADING
    // ============================================

    useEffect(() => {
        loadDraft();
        loadRecentAddresses();
        loadServiceTypes();
        loadDistricts();
        loadDispatchers();
        loadPlatformSettings();
    }, [loadServiceTypes, loadDistricts, loadDispatchers, loadPlatformSettings]);
    useEffect(() => {
        if (!authUser?.id) {
            invalidateLoaders();
            setUser(null);
            setOrders([]);
            setQueueTotalCount(0);
            setStatusCounts({ Active: 0, Payment: 0, Confirmed: 0, Canceled: 0 });
            setAttentionOrders([]);
            setNeedsAttentionCount(0);
            setStatsSummary(null);
            setPartnerFinanceSummary(null);
            setPartnerPayoutRequests([]);
            setPartnerTransactions([]);
            return;
        }
        setUser((prev) => {
            if (prev?.id === authUser.id) return { ...prev, ...authUser };
            return authUser;
        });
    }, [authUser, invalidateLoaders]);

    useEffect(() => {
        if (!authUser?.id) return;
        loadQueueData({ reason: 'auth_user_sync' });
    }, [authUser?.id, loadQueueData]);

    useEffect(() => {
        loadServiceTypes();
        loadDistricts();
    }, [language, loadServiceTypes, loadDistricts]);

    useEffect(() => {
        const filtersChanged = prevQueueFilterSignatureRef.current !== queueFilterSignature;
        prevQueueFilterSignatureRef.current = queueFilterSignature;
        if (filtersChanged && page > 1) {
            setPage(1);
            return;
        }
        loadQueueData({ reason: 'query_change' });
    }, [page, queueFilterSignature]);

    // Set default callout fee when settings load
    useEffect(() => {
        if (platformSettings?.base_price && !newOrder.calloutFee) {
            setNewOrder(prev => ({ ...prev, calloutFee: String(platformSettings.base_price) }));
        }
    }, [platformSettings]);

    useEffect(() => {
        const useNativeDriver = Platform.OS !== 'web';
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(skeletonPulse, { toValue: 1, duration: 900, useNativeDriver }),
                Animated.timing(skeletonPulse, { toValue: 0.6, duration: 900, useNativeDriver }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [skeletonPulse]);

    useEffect(() => {
        return () => {
            if (statsTooltipTimer.current) {
                clearTimeout(statsTooltipTimer.current);
            }
        };
    }, []);

    const statsWindowDays = statsRange === 'month' ? 30 : 7;
    useEffect(() => {
        if (activeTab !== 'stats') return;
        let canceled = false;
        const run = async () => {
            const summary = await loadStatsSummary(statsWindowDays, 'stats_tab');
            if (canceled) return;
            setStatsSummary(summary || null);
        };
        run();
        return () => { canceled = true; };
    }, [activeTab, statsWindowDays, loadStatsSummary, setStatsSummary]);

    useEffect(() => {
        if (!isPartner || !['settings', 'stats'].includes(activeTab)) return;
        let canceled = false;
        const run = async () => {
            const summary = await loadPartnerFinance();
            if (canceled || !summary) return;
        };
        run();
        return () => { canceled = true; };
    }, [activeTab, isPartner, loadPartnerFinance]);

    const handleRefresh = useCallback(async () => {
        await onRefresh({ includeStats: activeTab === 'stats', statsDays: statsWindowDays });
        if (isPartner && ['settings', 'stats'].includes(activeTab)) {
            await loadPartnerFinance();
        }
    }, [onRefresh, activeTab, statsWindowDays, isPartner, loadPartnerFinance]);

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

    const loadMastersIntoState = useCallback(async () => {
        const data = await loadMasters();
        const normalized = Array.isArray(data) ? data : [];
        assignMasterBaseRef.current = normalized;
        setAssignMasterSearchQuery('');
        setAssignMasterSearchLoading(false);
        setMasters(normalized);
    }, [loadMasters]);

    const resetNewMasterForm = useCallback(() => {
        setNewMasterData({
            email: '',
            password: '',
            full_name: '',
            phone: '',
            service_area: '',
        });
        setNewMasterPhoneError('');
    }, []);

    const openAddMasterModal = useCallback(() => {
        setShowAddMasterModal(true);
    }, []);

    const handleNewMasterPhoneChange = useCallback((text) => {
        const rawValue = String(text || '');
        const normalized = normalizeKyrgyzPhone(rawValue);
        const nextValue = normalized || rawValue;
        setNewMasterData((prev) => ({ ...prev, phone: nextValue }));
        setNewMasterPhoneError(nextValue && !isValidKyrgyzPhone(nextValue)
            ? (t('errorPhoneFormat') || 'Invalid format (+996...)')
            : '');
    }, [t]);

    const handleNewMasterPhoneBlur = useCallback(() => {
        const rawValue = String(newMasterData?.phone || '').trim();
        if (!rawValue) {
            setNewMasterPhoneError('');
            return;
        }
        const normalized = normalizeKyrgyzPhone(rawValue);
        if (!normalized) {
            setNewMasterPhoneError(t('errorPhoneFormat') || 'Invalid format (+996...)');
            return;
        }
        setNewMasterData((prev) => ({ ...prev, phone: normalized }));
        setNewMasterPhoneError('');
    }, [newMasterData?.phone, t]);

    const handleCreateMasterAccount = useCallback(async () => {
        const email = String(newMasterData?.email || '').trim().toLowerCase();
        const password = String(newMasterData?.password || '');
        const fullName = String(newMasterData?.full_name || '').trim();
        const rawPhone = String(newMasterData?.phone || '').trim();
        const normalizedPhone = rawPhone ? normalizeKyrgyzPhone(rawPhone) : '';
        const serviceArea = String(newMasterData?.service_area || '').trim();

        if (!email || !password || !fullName) {
            showToast(t('toastFillRequired') || 'Please fill required fields', 'error');
            return;
        }

        if (!EMAIL_FORMAT_REGEX.test(email)) {
            showToast(t('invalidEmail') || 'Invalid email format', 'error');
            return;
        }

        if (password.length < 6) {
            showToast(t('minCharacters') || 'Minimum 6 characters', 'error');
            return;
        }

        if (rawPhone && !normalizedPhone) {
            setNewMasterPhoneError(t('errorPhoneFormat') || 'Invalid format (+996...)');
            showToast(t('toastFixPhone') || 'Fix phone format', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await authService.createUser(
                {
                    ...newMasterData,
                    email,
                    password,
                    full_name: fullName,
                    phone: normalizedPhone || '',
                    service_area: serviceArea,
                    role: 'master',
                },
                {
                    creatorRole: user?.role || authUser?.role || null,
                }
            );

            if (!result?.success) {
                showToast(result?.message || (t('errorGeneric') || 'Error'), 'error');
                return;
            }

            showToast(
                result?.message || (t('masterCreatedAwaitingVerification') || 'Master created. Waiting for admin verification'),
                'success'
            );
            setShowAddMasterModal(false);
            resetNewMasterForm();
        } catch (error) {
            showToast(error?.message || (t('errorGeneric') || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    }, [
        newMasterData,
        t,
        user?.role,
        authUser?.role,
        showToast,
        resetNewMasterForm,
    ]);

    const handleSubmitPartnerPayout = useCallback(async () => {
        if (!isPartner) return false;
        const rawAmount = String(partnerPayoutAmount || '').replace(',', '.');
        const amount = Number(rawAmount);
        const minPayout = Number(partnerFinanceSummary?.minPayout || 50);
        const currentBalance = Number(partnerFinanceSummary?.balance || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast(t('toastFillRequired') || 'Enter payout amount', 'error');
            return false;
        }
        if (amount < minPayout) {
            showToast(
                `${t('partnerMinPayoutHint') || 'Minimum payout'}: ${minPayout} ${t('currencySom') || 'som'}`,
                'error'
            );
            return false;
        }
        if (amount > currentBalance) {
            showToast(t('insufficientBalance') || 'Insufficient balance', 'error');
            return false;
        }
        setActionLoading(true);
        try {
            const result = await partnerFinanceService.createPayoutRequest(
                amount,
                partnerPayoutNote?.trim() || null
            );
            if (!result?.success) {
                showToast(result?.message || (t('toastOrderFailed') || 'Request failed'), 'error');
                return false;
            }
            showToast(result?.message || (t('toastUpdated') || 'Request sent'), 'success');
            setPartnerPayoutAmount('');
            setPartnerPayoutNote('');
            await loadPartnerFinance();
            return true;
        } catch (error) {
            showToast(error?.message || (t('errorGeneric') || 'Error'), 'error');
            return false;
        } finally {
            setActionLoading(false);
        }
    }, [
        isPartner,
        partnerPayoutAmount,
        partnerPayoutNote,
        partnerFinanceSummary,
        showToast,
        t,
        loadPartnerFinance,
        setActionLoading,
    ]);

    const openDistrictPicker = () => {
        setPickerModal({
            visible: true,
            title: TRANSLATIONS[language].createDistrict || 'District',
            value: newOrder.area,
            options: districts.map(d => ({ id: d.id, label: d.label })),
            onChange: (val) => setNewOrder(prev => ({ ...prev, area: val }))
        });
    };

    const openEditDistrictPicker = () => {
        setPickerModal({
            visible: true,
            title: TRANSLATIONS[language].createDistrict || 'District',
            value: editForm.area,
            options: districts.map(d => ({ id: d.id, label: d.label })),
            onChange: (val) => setEditForm(prev => ({ ...prev, area: val }))
        });
    };

    // ============================================
    // FILTERING
    // ============================================

    const needsActionOrders = useMemo(() => attentionOrders || [], [attentionOrders]);
    const filteredOrders = useMemo(() => orders || [], [orders]);

    const statsWindowStart = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (statsWindowDays - 1));
        return start;
    }, [statsWindowDays]);
    const statsWindowEnd = useMemo(() => {
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        return end;
    }, [statsWindowDays]);

    const statsCurrent = statsSummary?.current || {};
    const statsDelta = statsSummary?.delta || { created: 0, handled: 0, completed: 0, canceled: 0 };
    const statsCreated = Number(statsCurrent.created || 0);
    const statsHandled = Number(statsCurrent.handled || 0);
    const statsCompleted = Number(statsCurrent.completed || 0);
    const statsCanceled = Number(statsCurrent.canceled || 0);
    const completionRate = Number(statsCurrent.completionRate || 0);
    const cancelRate = Number(statsCurrent.cancelRate || 0);
    const partnerPendingRequestedAmount = useMemo(
        () => (partnerPayoutRequests || [])
            .filter((item) => item.status === 'requested')
            .reduce((sum, item) => sum + Number(item.requested_amount || 0), 0),
        [partnerPayoutRequests]
    );
    const createdSeries = useMemo(() => {
        const series = statsSummary?.series?.created;
        if (Array.isArray(series) && series.length === statsWindowDays) return series;
        return new Array(statsWindowDays).fill(0);
    }, [statsSummary, statsWindowDays]);
    const handledSeries = useMemo(() => {
        const series = statsSummary?.series?.handled;
        if (Array.isArray(series) && series.length === statsWindowDays) return series;
        return new Array(statsWindowDays).fill(0);
    }, [statsSummary, statsWindowDays]);

    const statsColumns = useMemo(() => {
        if (statsGridWidth >= 1100) return 3;
        if (statsGridWidth >= 760) return 2;
        return 1;
    }, [statsGridWidth]);

    const clearStatsTooltipTimer = useCallback(() => {
        if (statsTooltipTimer.current) {
            clearTimeout(statsTooltipTimer.current);
            statsTooltipTimer.current = null;
        }
    }, []);

    const showStatsTooltip = useCallback((payload, resetTimer = true) => {
        setStatsTooltip(payload);
        if (resetTimer) {
            clearStatsTooltipTimer();
            statsTooltipTimer.current = setTimeout(() => {
                setStatsTooltip(null);
            }, 2200);
        }
    }, [clearStatsTooltipTimer]);

    const updateStatsTooltipPos = useCallback((x, y) => {
        setStatsTooltip(prev => (prev ? { ...prev, x, y } : prev));
    }, []);

    const hideStatsTooltip = useCallback(() => {
        clearStatsTooltipTimer();
        setStatsTooltip(null);
    }, [clearStatsTooltipTimer]);

    const getSeriesMeta = useCallback((series) => {
        const total = series.reduce((sum, v) => sum + v, 0);
        const max = Math.max(0, ...series);
        const avg = series.length ? total / series.length : 0;
        const last = series[series.length - 1] || 0;
        return { total, max, avg, last };
    }, []);

    const formatShortDate = (date) => {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}/${day}`;
    };

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil((queueTotalCount || 0) / pageSize));
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [queueTotalCount, pageSize, page]);

    const {
        handleCreateOrder,
        handlePhoneBlur,
        handlePastePhone,
        handleCall,
        handleConfirmPayment,
        handleReportMaster,
        openAssignModal,
        openTransferPicker,
        handleAssignMaster,
        openMasterDetails,
        closeMasterDetails,
        handleRemoveMaster,
        handleSaveEdit,
        handleCancel,
        handleReopen,
        copyToClipboard,
        handleLogout,
        clearForm,
        keepLocationAndReset,
    } = useDispatcherOrderActions({
        language,
        translations: TRANSLATIONS,
        showToast,
        user,
        dispatchers,
        activeTab,
        statsWindowDays,
        newOrder,
        phoneError,
        confirmChecked,
        paymentData,
        paymentOrder,
        assignTarget,
        detailsOrder,
        editForm,
        platformSettings,
        generateIdempotencyKey,
        setActionLoading,
        setPhoneError,
        setNewOrder,
        setConfirmChecked,
        setCreationSuccess,
        setQueueTotalCount,
        setPickerModal,
        setPaymentData,
        setPaymentOrder,
        setShowPaymentModal,
        setShowAssignModal,
        setAssignTarget,
        setDetailsOrder,
        setShowMasterDetails,
        setMasterDetails,
        setMasterDetailsLoading,
        setIsEditing,
        setIsSidebarOpen,
        setIdempotencyKey,
        patchOrderInState,
        removeOrderFromState,
        addOrderToState,
        scheduleBackgroundRefresh,
        loadQueueData,
        loadStatsSummary,
        saveRecentAddress,
        logout,
        navigation,
    });

    // ============================================
    // ACTIONS
    // ============================================

    // Save draft on change
    useEffect(() => {
        if (!creationSuccess) {
            const timer = setTimeout(() => saveDraft(newOrder), 1000);
            return () => clearTimeout(timer);
        }
    }, [newOrder, creationSuccess]);

    // Load masters when assign modal opens
    useEffect(() => {
        if (showAssignModal) loadMastersIntoState();
    }, [showAssignModal, loadMastersIntoState]);

    useEffect(() => {
        if (!showAssignModal) {
            assignMasterSearchReqRef.current += 1;
            setAssignMasterSearchLoading(false);
            return;
        }

        const query = normalizeSearchTerm(assignMasterSearchDebounced);
        if (!query || query.length < 2) {
            setMasters(assignMasterBaseRef.current || []);
            setAssignMasterSearchLoading(false);
            return;
        }

        const localMatches = (assignMasterBaseRef.current || []).filter((master) => matchesMasterSearch(master, query));
        if (localMatches.length > 0) {
            setMasters(localMatches);
        }

        let cancelled = false;
        const requestId = assignMasterSearchReqRef.current + 1;
        assignMasterSearchReqRef.current = requestId;
        setAssignMasterSearchLoading(true);

        ordersService.getAvailableMasters({ search: query, limit: 80, offset: 0, force: true })
            .then((data) => {
                if (cancelled || requestId !== assignMasterSearchReqRef.current) return;
                setMasters(Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                if (cancelled || requestId !== assignMasterSearchReqRef.current) return;
                console.error(`${LOG_PREFIX} assign master search failed`, error);
                setMasters(localMatches);
            })
            .finally(() => {
                if (cancelled || requestId !== assignMasterSearchReqRef.current) return;
                setAssignMasterSearchLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [showAssignModal, assignMasterSearchDebounced]);

    // Date/Time Parsers & Handlers
    const parseDateStr = (str) => {
        if (!str) return new Date();
        const parts = str.split('.');
        if (parts.length !== 3) return new Date();
        // DD.MM.YYYY
        return new Date(parts[2], parseInt(parts[1], 10) - 1, parts[0]);
    };

    const parseTimeStr = (str) => {
        if (!str) return new Date();
        const parts = str.split(':');
        if (parts.length !== 2) return new Date();
        const d = new Date();
        d.setHours(parseInt(parts[0], 10));
        d.setMinutes(parseInt(parts[1], 10));
        return d;
    };

    const onDateChange = (event, selectedDate) => {
        if (Platform.OS !== 'ios') setShowDatePicker(false);
        if (selectedDate) {
            const d = selectedDate.getDate().toString().padStart(2, '0');
            const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
            const y = selectedDate.getFullYear();
            setNewOrder(prev => ({ ...prev, preferredDate: `${d}.${m}.${y}` }));
        }
    };

    const onTimeChange = (event, selectedTime) => {
        if (Platform.OS !== 'ios') setShowTimePicker(false);
        if (selectedTime) {
            const h = selectedTime.getHours().toString().padStart(2, '0');
            const m = selectedTime.getMinutes().toString().padStart(2, '0');
            setNewOrder(prev => ({ ...prev, preferredTime: `${h}:${m}` }));
        }
    };

    // ============================================
    // RENDER COMPONENTS
    // ============================================

    const handleTabSelect = useCallback((nextTab) => {
        setActiveTab(nextTab);
        setIsSidebarOpen(false);
    }, [setActiveTab]);

    const goToCreateOrderTab = useCallback(() => {
        setActiveTab('create');
    }, [setActiveTab]);

    const openPartnerPayoutComposer = useCallback(() => {
        setActiveTab('settings');
        setPartnerPayoutComposerToken(Date.now());
    }, [setActiveTab]);

    const renderPickerModal = () => (
        <DispatcherPickerModal
            pickerModal={pickerModal}
            setPickerModal={setPickerModal}
            styles={styles}
            translations={TRANSLATIONS}
            language={language}
        />
    );

    const renderSidebar = () => (
        <DispatcherSidebar
            visible={isSidebarOpen}
            styles={styles}
            isDark={isDark}
            activeTab={activeTab}
            onSelectTab={handleTabSelect}
            onClose={() => setIsSidebarOpen(false)}
            translations={TRANSLATIONS}
            language={language}
            needsAttentionCount={needsAttentionCount}
            onToggleTheme={() => setIsDark(prev => !prev)}
            cycleLanguage={cycleLanguage}
            user={user}
            isPartner={isPartner}
            onLogout={handleLogout}
        />
    );

    const renderHeader = () => (
        <DispatcherHeader
            styles={styles}
            isDark={isDark}
            activeTab={activeTab}
            labels={TRANSLATIONS[language]}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            onRefresh={handleRefresh}
        />
    );

    const renderQueue = () => (
        <DispatcherQueueTab
            styles={styles}
            isDark={isDark}
            translations={TRANSLATIONS}
            language={language}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            viewMode={viewMode}
            setViewMode={setViewMode}
            showFilters={showFilters}
            setShowFilters={setShowFilters}
            setPickerModal={setPickerModal}
            filterUrgency={filterUrgency}
            setFilterUrgency={setFilterUrgency}
            filterService={filterService}
            setFilterService={setFilterService}
            filterSort={filterSort}
            setFilterSort={setFilterSort}
            serviceTypes={serviceTypes}
            needsAttentionCount={needsAttentionCount}
            needsActionOrders={needsActionOrders}
            filterAttentionType={filterAttentionType}
            setFilterAttentionType={setFilterAttentionType}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            showNeedsAttention={showNeedsAttention}
            setShowNeedsAttention={setShowNeedsAttention}
            setDetailsOrder={setDetailsOrder}
            openAssignModal={openAssignModal}
            canAssignMasters={!isPartner}
            filteredOrders={filteredOrders}
            queueTotalCount={queueTotalCount}
            pageSize={pageSize}
            loading={loading}
            refreshing={refreshing}
            handleRefresh={handleRefresh}
            skeletonPulse={skeletonPulse}
            page={page}
            setPage={setPage}
            setShowPaymentModal={setShowPaymentModal}
            setPaymentOrder={setPaymentOrder}
            setPaymentData={setPaymentData}
            t={t}
            STATUS_COLORS={STATUS_COLORS}
            getOrderStatusLabel={getOrderStatusLabel}
            getServiceLabel={getServiceLabel}
            getTimeAgo={getTimeAgo}
        />
    );

    const renderStats = () => (
        <DispatcherStatsTab
            styles={styles}
            isDark={isDark}
            translations={TRANSLATIONS}
            language={language}
            isPartner={isPartner}
            statsRange={statsRange}
            setStatsRange={setStatsRange}
            statsWindowDays={statsWindowDays}
            statsWindowStart={statsWindowStart}
            statsWindowEnd={statsWindowEnd}
            createdSeries={createdSeries}
            handledSeries={handledSeries}
            statsCreated={statsCreated}
            statsHandled={statsHandled}
            statsCompleted={statsCompleted}
            statsCanceled={statsCanceled}
            completionRate={completionRate}
            cancelRate={cancelRate}
            statsDelta={statsDelta}
            statsColumns={statsColumns}
            statsGridWidth={statsGridWidth}
            setStatsGridWidth={setStatsGridWidth}
            statsTooltip={statsTooltip}
            showStatsTooltip={showStatsTooltip}
            hideStatsTooltip={hideStatsTooltip}
            updateStatsTooltipPos={updateStatsTooltipPos}
            statsInfo={statsInfo}
            setStatsInfo={setStatsInfo}
            getSeriesMeta={getSeriesMeta}
            formatShortDate={formatShortDate}
            SCREEN_WIDTH={SCREEN_WIDTH}
            loading={loading}
            skeletonPulse={skeletonPulse}
            partnerFinanceSummary={partnerFinanceSummary}
            partnerPendingRequestedAmount={partnerPendingRequestedAmount}
            partnerTransactions={partnerTransactions}
            partnerPayoutRequests={partnerPayoutRequests}
            onCreateOrder={goToCreateOrderTab}
            onRequestPayout={openPartnerPayoutComposer}
        />
    );
    const renderCreateOrder = () => (
        <DispatcherCreateOrderTab
            styles={styles}
            isDark={isDark}
            translations={TRANSLATIONS}
            language={language}
            actionLoading={actionLoading}
            creationSuccess={creationSuccess}
            setActiveTab={setActiveTab}
            setCreationSuccess={setCreationSuccess}
            clearForm={clearForm}
            keepLocationAndReset={keepLocationAndReset}
            phoneError={phoneError}
            newOrder={newOrder}
            setNewOrder={setNewOrder}
            handlePhoneBlur={handlePhoneBlur}
            handlePastePhone={handlePastePhone}
            openDistrictPicker={openDistrictPicker}
            districts={districts}
            serviceTypes={serviceTypes}
            showDatePicker={showDatePicker}
            showTimePicker={showTimePicker}
            setShowDatePicker={setShowDatePicker}
            setShowTimePicker={setShowTimePicker}
            parseDateStr={parseDateStr}
            parseTimeStr={parseTimeStr}
            onDateChange={onDateChange}
            onTimeChange={onTimeChange}
            platformSettings={platformSettings}
            sanitizeNumberInput={sanitizeNumberInput}
            confirmChecked={confirmChecked}
            setConfirmChecked={setConfirmChecked}
            handleCreateOrder={handleCreateOrder}
            loading={loading}
            skeletonPulse={skeletonPulse}
        />
    );

    const renderSettings = () => (
        <DispatcherSettingsTab
            styles={styles}
            isDark={isDark}
            translations={TRANSLATIONS}
            language={language}
            user={user}
            setLanguage={setLanguage}
            setIsDark={setIsDark}
            loading={loading}
            skeletonPulse={skeletonPulse}
            isPartner={isPartner}
            partnerFinanceSummary={partnerFinanceSummary}
            partnerPayoutRequests={partnerPayoutRequests}
            partnerTransactions={partnerTransactions}
            partnerPayoutAmount={partnerPayoutAmount}
            setPartnerPayoutAmount={setPartnerPayoutAmount}
            partnerPayoutNote={partnerPayoutNote}
            setPartnerPayoutNote={setPartnerPayoutNote}
            onSubmitPartnerPayout={handleSubmitPartnerPayout}
            partnerFinanceLoading={partnerFinanceLoading}
            actionLoading={actionLoading}
            openPayoutComposerToken={partnerPayoutComposerToken}
            onOpenAddMaster={openAddMasterModal}
            addMasterDisabled={actionLoading}
        />
    );
    const renderAddMasterModal = () => (
        <Modal
            visible={showAddMasterModal}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (actionLoading) return;
                setShowAddMasterModal(false);
                resetNewMasterForm();
            }}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, !isDark && styles.modalContentLight, { width: Math.min(460, SCREEN_WIDTH - 24) }]}>
                    <Text style={[styles.modalTitle, !isDark && styles.textDark]}>
                        {TRANSLATIONS[language].addMaster || 'Add Master'}
                    </Text>
                    <Text style={[styles.settingsMeta, !isDark && styles.textSecondary, { marginBottom: 14 }]}>
                        {TRANSLATIONS[language].createNewMasterAccount || 'Create a new master account. Admin verification is required before assignment.'}
                    </Text>

                    <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                        <View style={{ gap: 10 }}>
                            <View>
                                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>
                                    {(TRANSLATIONS[language].loginEmail || 'Email')} *
                                </Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={newMasterData.email}
                                    onChangeText={(text) => setNewMasterData((prev) => ({ ...prev, email: text }))}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    placeholder={TRANSLATIONS[language].loginEmailPlaceholder || 'email@example.com'}
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                />
                            </View>
                            <View>
                                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>
                                    {(TRANSLATIONS[language].loginPassword || 'Password')} *
                                </Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={newMasterData.password}
                                    onChangeText={(text) => setNewMasterData((prev) => ({ ...prev, password: text }))}
                                    secureTextEntry
                                    placeholder={TRANSLATIONS[language].minCharacters || 'Minimum 6 characters'}
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                />
                            </View>
                            <View>
                                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].fullName || 'Full Name'} *</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={newMasterData.full_name}
                                    onChangeText={(text) => setNewMasterData((prev) => ({ ...prev, full_name: text }))}
                                    placeholder={TRANSLATIONS[language].placeholderFullName || 'John Doe'}
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                />
                            </View>
                            <View>
                                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].phone || 'Phone'}</Text>
                                <TextInput
                                    style={[styles.input, newMasterPhoneError && styles.inputError, !isDark && styles.inputLight]}
                                    value={newMasterData.phone}
                                    onChangeText={handleNewMasterPhoneChange}
                                    onBlur={handleNewMasterPhoneBlur}
                                    keyboardType="phone-pad"
                                    placeholder="+996..."
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                />
                                {newMasterPhoneError ? <Text style={styles.errorText}>{newMasterPhoneError}</Text> : null}
                            </View>
                            <View>
                                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].serviceArea || 'Service Area'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={newMasterData.service_area}
                                    onChangeText={(text) => setNewMasterData((prev) => ({ ...prev, service_area: text }))}
                                    placeholder={TRANSLATIONS[language].placeholderArea || 'Area / district'}
                                    placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                />
                            </View>
                        </View>
                    </ScrollView>

                    <View style={[styles.modalButtons, { marginTop: 16 }]}>
                        <TouchableOpacity
                            style={[
                                styles.modalCancel,
                                !isDark && styles.modalCancelLight,
                                actionLoading && !isDark && styles.modalBtnDisabledLight,
                            ]}
                            onPress={() => {
                                if (actionLoading) return;
                                setShowAddMasterModal(false);
                                resetNewMasterForm();
                            }}
                            disabled={actionLoading}
                        >
                            <Text style={[styles.modalCancelText, !isDark && styles.modalCancelTextLight]}>
                                {TRANSLATIONS[language].cancel || 'Cancel'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.modalConfirm,
                                !isDark && styles.modalConfirmLight,
                                (actionLoading || !newMasterData.email || !newMasterData.password || !newMasterData.full_name || Boolean(newMasterPhoneError))
                                && (isDark ? styles.bottomPublishBtnDisabled : styles.modalConfirmDisabledLight),
                            ]}
                            onPress={actionLoading ? undefined : handleCreateMasterAccount}
                            disabled={actionLoading || !newMasterData.email || !newMasterData.password || !newMasterData.full_name || Boolean(newMasterPhoneError)}
                        >
                            <Text
                                style={[
                                    styles.modalConfirmText,
                                    (actionLoading || !newMasterData.email || !newMasterData.password || !newMasterData.full_name || Boolean(newMasterPhoneError))
                                    && !isDark
                                    && styles.modalConfirmTextDisabledLight,
                                ]}
                            >
                                {actionLoading
                                    ? (TRANSLATIONS[language].creating || 'Creating...')
                                    : (TRANSLATIONS[language].createMaster || 'Create Master')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
    const renderDetailsDrawer = () => {
        if (!detailsOrder) return null;
        // NOTE: handleSaveEdit is defined earlier in the component (around line 1146)
        // with proper fee handling, area, orientir, etc.
        const calloutValue = detailsOrder.callout_fee;
        const hasFinalPrice = detailsOrder.final_price !== null
            && detailsOrder.final_price !== undefined
            && detailsOrder.final_price !== '';
        const mainPriceValue = hasFinalPrice ? detailsOrder.final_price : detailsOrder.initial_price;
        const formatPriceValue = (value, fallback = '-') => {
            if (value === null || value === undefined || value === '') return fallback;
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return `${value}c`;
            return String(value);
        };
        const screenWidth = Dimensions.get('window').width;
        const drawerWidth = screenWidth <= 480 ? screenWidth : (screenWidth > 500 ? 400 : screenWidth * 0.85);
        const fullWidthDrawer = drawerWidth >= screenWidth;
        const canAssignMaster = !isPartner && ['placed', 'reopened'].includes(detailsOrder.status);
        const canCancelOrder = !isPartner && ['placed', 'reopened', 'expired', 'canceled_by_master'].includes(detailsOrder.status);

        const drawerBody = (
            <View style={styles.drawerOverlay}>
                <TouchableOpacity style={[styles.drawerBackdrop, fullWidthDrawer && styles.drawerBackdropHidden]} onPress={() => setDetailsOrder(null)} />
                <View style={[styles.drawerContent, !isDark && styles.drawerContentLight, { width: drawerWidth }]}>
                        <View style={[styles.drawerHeader, !isDark && styles.drawerHeaderLight]}>
                            <View>
                                <Text style={[styles.drawerTitle, !isDark && styles.textDark]}>{(TRANSLATIONS[language].drawerTitle || 'Order #{0}').replace('{0}', detailsOrder.id.slice(0, 8))}</Text>
                                <Text style={styles.drawerDate}>{new Date(detailsOrder.created_at).toLocaleString()}</Text>
                            </View>
                            <View style={styles.drawerActions}>
                                {!isEditing && !isPartner && (
                                    <TouchableOpacity
                                        style={styles.editBtn}
                                        onPress={() => {
                                            // Start editing - explicitly copy all editable fields
                                            setEditForm({
                                                ...detailsOrder,
                                                client_name: detailsOrder.client?.full_name || detailsOrder.client_name || '',
                                                client_phone: detailsOrder.client?.phone || detailsOrder.client_phone || '',
                                                area: detailsOrder.area || '',
                                                full_address: detailsOrder.full_address || '',
                                                orientir: detailsOrder.orientir || '',
                                                problem_description: detailsOrder.problem_description || '',
                                                initial_price: detailsOrder.initial_price ?? '',
                                                callout_fee: detailsOrder.callout_fee ?? '',
                                                dispatcher_note: detailsOrder.dispatcher_note || '',
                                            });
                                            setIsEditing(true);
                                        }}>
                                        <Text style={styles.editBtnText}>{TRANSLATIONS[language].btnEdit}</Text>
                                    </TouchableOpacity>
                                )}

                                {/* Close Drawer Button */}
                                <TouchableOpacity
                                    onPress={() => { setDetailsOrder(null); setIsEditing(false); }}
                                    style={[styles.drawerCloseBtn, !isDark && styles.drawerCloseBtnLight]}
                                >
                                    <Text style={[styles.drawerCloseText, !isDark && styles.drawerCloseTextLight]}>X</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <ScrollView style={styles.drawerBody}>
                            {/* Status */}
                            <View style={styles.drawerSection}>
                                <View style={styles.drawerStatusRow}>
                                    <View style={[styles.drawerStatusBadge, { backgroundColor: STATUS_COLORS[detailsOrder.status] }]}>
                                        <Text style={styles.drawerStatusText}>{getOrderStatusLabel(detailsOrder.status, t)}</Text>
                                    </View>
                                    {detailsOrder.status === 'completed' && (
                                        <TouchableOpacity style={[styles.drawerBtn, { backgroundColor: '#22c55e' }]} onPress={() => {
                                            setPaymentOrder(detailsOrder); // Store order for payment modal
                                            setPaymentData(buildPaymentConfirmationData(detailsOrder));
                                            setDetailsOrder(null); // Close drawer
                                            setShowPaymentModal(true);
                                        }}>
                                            <Text style={styles.drawerBtnText}>{TRANSLATIONS[language].actionPay}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            <View style={styles.drawerSection}>
                                <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionDispatcher || 'Dispatcher'}</Text>
                                <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                    {(() => {
                                        const assignedDispatcherId = detailsOrder.assigned_dispatcher_id || detailsOrder.dispatcher_id;
                                        const assignedDispatcher = detailsOrder.assigned_dispatcher
                                            || detailsOrder.dispatcher
                                            || dispatchers.find(d => d?.id === assignedDispatcherId);
                                        const assignedName = assignedDispatcher?.full_name || 'Dispatcher';
                                        const assignedPhone = assignedDispatcher?.phone;
                                        const isCurrentHandler = assignedDispatcherId && user?.id && String(assignedDispatcherId) === String(user.id);
                                        return (
                                            <>
                                                <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>
                                                    {isCurrentHandler ? (TRANSLATIONS[language].labelYou || 'You') : assignedName}
                                                </Text>
                                                {assignedPhone && (
                                                    <View style={styles.drawerRow}>
                                                        <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{assignedPhone}</Text>
                                                        <View style={styles.drawerRowBtns}>
                                                            <TouchableOpacity onPress={() => copyToClipboard(assignedPhone)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                                            <TouchableOpacity onPress={() => Linking.openURL(`tel:${assignedPhone}`)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCall}</Text></TouchableOpacity>
                                                        </View>
                                                    </View>
                                                )}
                                                {isCurrentHandler && !isPartner && (
                                                    <View style={{ marginTop: 10 }}>
                                                        <TouchableOpacity style={styles.drawerBtnSecondary} onPress={() => openTransferPicker(detailsOrder)}>
                                                            <Text style={styles.drawerBtnSecondaryText}>{TRANSLATIONS[language].actionTransfer || 'Transfer'}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </>
                                        );
                                    })()}
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

                                    {/* Location Editing */}
                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].createDistrict || 'District'}</Text>
                                    <TouchableOpacity
                                        style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, !isDark && styles.inputLight]}
                                        onPress={openEditDistrictPicker}
                                    >
                                        <Text style={[styles.pickerBtnText, !editForm.area && styles.placeholderText, !isDark && styles.textDark]}>
                                            {editForm.area ? (districts.find(d => d.id === editForm.area)?.label || editForm.area) : (TRANSLATIONS[language].selectOption || 'Select')}
                                        </Text>
                                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{'\u25BE'}</Text>
                                    </TouchableOpacity>

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].address}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={editForm.full_address || ''}
                                        onChangeText={t => setEditForm({ ...editForm, full_address: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].createOrientir || 'Landmarks'}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={editForm.orientir || ''}
                                        onChangeText={t => setEditForm({ ...editForm, orientir: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        placeholder={TRANSLATIONS[language].orientirPlaceholder || "e.g. Near Beta Stores"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].description}</Text>
                                    <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} value={editForm.problem_description || ''}
                                        onChangeText={t => setEditForm({ ...editForm, problem_description: t })} multiline placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    {/* Fee Editing */}
                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].calloutFee || 'Call-out Fee'}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={String(editForm.callout_fee ?? '')}
                                        onChangeText={t => setEditForm({ ...editForm, callout_fee: sanitizeNumberInput(t) })}
                                        keyboardType="numeric" placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].initialPrice || 'Initial Price'}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={String(editForm.initial_price ?? '')}
                                        onChangeText={t => setEditForm({ ...editForm, initial_price: sanitizeNumberInput(t) })}
                                        keyboardType="numeric" placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].sectionNote}</Text>
                                    <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} value={editForm.dispatcher_note || ''}
                                        onChangeText={t => setEditForm({ ...editForm, dispatcher_note: t })} multiline placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    {detailsOrder?.master && !isPartner && (
                                        <View style={styles.editActionRow}>
                                            <TouchableOpacity style={[styles.editActionBtn, styles.editActionPrimary]} onPress={() => openAssignModal(detailsOrder)}>
                                                <Text style={styles.editActionText}>{TRANSLATIONS[language].actionAssignMaster || TRANSLATIONS[language].actionAssign || 'Assign Master'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.editActionBtn, styles.editActionDanger]} onPress={handleRemoveMaster}>
                                                <Text style={styles.editActionText}>{TRANSLATIONS[language].actionUnassign || 'Remove Master'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}


                                    <View style={styles.editFooterRow}>
                                        <TouchableOpacity
                                            style={[styles.editCancelBtn, actionLoading && styles.pointerEventsNone]}
                                            onPress={actionLoading ? undefined : () => setIsEditing(false)}
                                        >
                                            <Text style={styles.editCancelText}>{TRANSLATIONS[language].btnCancelEdit}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.saveEditBtn, actionLoading && styles.pointerEventsNone]}
                                            onPress={actionLoading ? undefined : handleSaveEdit}
                                        >
                                            {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveEditText}>{TRANSLATIONS[language].btnSaveChanges}</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.drawerSections}>
                                    {/* Client */}
                                    <View style={styles.drawerSection}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionClient}</Text>
                                        <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                            <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.client?.full_name || detailsOrder.client_name || 'N/A'}</Text>
                                            <View style={styles.drawerRow}>
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.client?.phone || detailsOrder.client_phone || 'N/A'}</Text>
                                                <View style={styles.drawerRowBtns}>
                                                    <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.client?.phone || detailsOrder.client_phone)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${detailsOrder.client?.phone || detailsOrder.client_phone}`)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCall}</Text></TouchableOpacity>
                                                </View>
                                            </View>
                                            <View style={styles.drawerRow}>
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.full_address}</Text>
                                                <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.full_address)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                            </View>
                                            {detailsOrder.orientir && (
                                                <View style={styles.drawerRow}>
                                                    <Text style={[styles.drawerRowText, !isDark && styles.textSecondary, { fontStyle: 'italic' }]}>
                                                        {TRANSLATIONS[language].labelOrientir || 'Landmark:'} {detailsOrder.orientir}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    {/* Master */}
                                    {detailsOrder.master && (
                                        <View style={styles.drawerSection}>
                                            <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionMaster}</Text>
                                            <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                                <View style={styles.masterHeaderRow}>
                                                    <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.master.full_name}</Text>
                                                    <TouchableOpacity style={styles.masterDetailsBtn} onPress={() => openMasterDetails(detailsOrder.master)}>
                                                        <Text style={styles.masterDetailsBtnText}>{TRANSLATIONS[language].btnDetails || 'Details'}</Text>
                                                    </TouchableOpacity>
                                                </View>
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
                                            <Text style={[styles.finValue, !isDark && styles.textDark]}>
                                                {formatPriceValue(calloutValue)}
                                            </Text>
                                        </View>
                                        <View style={styles.finRow}>
                                            <Text style={styles.finLabel}>{hasFinalPrice ? TRANSLATIONS[language].labelFinal : TRANSLATIONS[language].labelInitial}</Text>
                                            <Text style={[styles.finValue, !isDark && styles.textDark, hasFinalPrice && { color: '#22c55e' }]}>
                                                {formatPriceValue(mainPriceValue, TRANSLATIONS[language].priceOpen)}
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
                                    {!isPartner && ['canceled_by_master', 'canceled_by_client'].includes(detailsOrder.status) && (
                                        <TouchableOpacity style={styles.reopenBtn} onPress={() => { handleReopen(detailsOrder.id); setDetailsOrder(null); }}>
                                            <Text style={styles.reopenText}>? {TRANSLATIONS[language].actionReopen}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {(canAssignMaster || canCancelOrder) && (
                                        <View style={styles.drawerBottomActionsRow}>
                                            {canAssignMaster && (
                                                <TouchableOpacity style={[styles.drawerBottomActionBtn, styles.drawerBottomActionPrimary]} onPress={() => openAssignModal(detailsOrder)}>
                                                    <Text style={styles.drawerBottomActionText}>
                                                        {TRANSLATIONS[language].actionAssignMaster || TRANSLATIONS[language].forceAssignMaster || TRANSLATIONS[language].actionAssign || 'Assign Master'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                            {canCancelOrder && (
                                                <TouchableOpacity style={[styles.drawerBottomActionBtn, styles.drawerBottomActionDanger]} onPress={() => { handleCancel(detailsOrder.id); setDetailsOrder(null); }}>
                                                    <Text style={styles.drawerBottomActionText}>{TRANSLATIONS[language].alertCancelTitle}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>
                </View>
            </View>
        );

        if (Platform.OS === 'web') {
            return <View style={styles.drawerOverlayWeb}>{drawerBody}</View>;
        }

        return (
            <Modal visible={!!detailsOrder} transparent animationType="none">
                {drawerBody}
            </Modal>
        );
    };

    // Payment Modal
    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS[language].titlePayment}</Text>
                    <Text style={styles.modalSubtitle}>
                        {(TRANSLATIONS[language].modalOrderPrefix || 'Order #{0}').replace('{0}', paymentOrder?.id?.slice(-8) || '')}
                    </Text>
                    <Text style={styles.modalAmount}>
                        {(TRANSLATIONS[language].labelAmount || 'Amount')} {paymentOrder?.final_price ?? paymentOrder?.initial_price ?? 'N/A'}с
                    </Text>

                    <Text style={styles.inputLabel}>{TRANSLATIONS[language].labelFinal || 'Final Amount'}</Text>
                    <TextInput
                        style={styles.input}
                        value={String(paymentData?.finalAmount ?? '')}
                        onChangeText={value => setPaymentData((prev) => ({ ...prev, finalAmount: sanitizeNumberInput(value) }))}
                        keyboardType="numeric"
                        placeholder={TRANSLATIONS[language].labelFinal || 'Final Amount'}
                        placeholderTextColor="#64748b"
                    />

                    <Text style={styles.inputLabel}>{TRANSLATIONS[language].labelWorkDone || 'Work Done'}</Text>
                    <Text style={[styles.input, { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 }]}>
                        {paymentOrder?.work_performed || paymentData?.workPerformed || '-'}
                    </Text>

                    <Text style={styles.inputLabel}>{TRANSLATIONS[language].labelTimeSpent || 'Time Spent (hours)'}</Text>
                    <Text style={[styles.input, { minHeight: 44, paddingTop: 12 }]}>
                        {paymentOrder?.hours_worked ?? paymentData?.hoursWorked ?? '-'}
                    </Text>

                    {!paymentOrder?.is_disputed && (
                        <>
                            <Text style={styles.inputLabel}>{TRANSLATIONS[language].labelReportReason || 'Report Reason'}</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                value={paymentData?.reportReason || ''}
                                onChangeText={value => setPaymentData((prev) => ({ ...prev, reportReason: value }))}
                                multiline
                                numberOfLines={3}
                                placeholder={TRANSLATIONS[language].labelReportReasonHint || 'Required only if reporting master'}
                                placeholderTextColor="#64748b"
                            />

                            <TouchableOpacity
                                style={[styles.modalCancel, { marginTop: 10, backgroundColor: '#dc2626' }]}
                                onPress={actionLoading ? undefined : handleReportMaster}
                                disabled={actionLoading}
                            >
                                <Text style={styles.modalCancelText}>{TRANSLATIONS[language].reportMaster || 'Report Master'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.modalCancel}
                            onPress={() => {
                                setShowPaymentModal(false);
                                setPaymentOrder(null);
                                setPaymentData({ ...DEFAULT_PAYMENT_CONFIRMATION_DATA });
                            }}
                        >
                            <Text style={styles.modalCancelText}>{TRANSLATIONS[language].cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalConfirm, actionLoading && styles.pointerEventsNone]}
                            onPress={actionLoading ? undefined : handleConfirmPayment}
                        >
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
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: 44,
                        borderWidth: 1,
                        borderColor: '#334155',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        marginBottom: 12,
                    }}>
                        <Ionicons name="search" size={16} color="#94a3b8" />
                        <TextInput
                            style={{
                                flex: 1,
                                color: '#fff',
                                paddingVertical: 10,
                                paddingHorizontal: 8,
                                borderWidth: 0,
                                ...(Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}),
                            }}
                            value={assignMasterSearchQuery}
                            onChangeText={setAssignMasterSearchQuery}
                            placeholder={TRANSLATIONS[language].placeholderSearch || 'Search by name or phone'}
                            placeholderTextColor="#64748b"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {assignMasterSearchLoading ? (
                            <ActivityIndicator size="small" color="#64748b" />
                        ) : assignMasterSearchQuery ? (
                            <TouchableOpacity onPress={() => setAssignMasterSearchQuery('')}>
                                <Ionicons name="close-circle" size={16} color="#94a3b8" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <FlatList
                        style={styles.mastersList}
                        data={masters}
                        keyExtractor={(m, index) => String(m?.id || m?.master_id || index)}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item: m }) => {
                            const maxJobs = Number.isFinite(Number(m.max_active_jobs)) ? Number(m.max_active_jobs) : null;
                            const activeJobs = Number.isFinite(Number(m.active_jobs)) ? Number(m.active_jobs) : 0;
                            const atLimit = maxJobs !== null && activeJobs >= maxJobs;
                            return (
                                <TouchableOpacity
                                    key={m.id}
                                    style={[styles.masterItem, atLimit && styles.masterItemDisabled]}
                                    onPress={() => handleAssignMaster(m)}
                                    disabled={atLimit}
                                >
                                    <View style={styles.masterItemHeader}>
                                        <Text style={[styles.masterName, atLimit && styles.masterNameDisabled]}>{m.full_name}</Text>
                                        {atLimit && <Text style={styles.masterLimitBadge}>{TRANSLATIONS[language].labelLimitReached || 'Limit reached'}</Text>}
                                    </View>
                                    <Text style={[styles.masterInfo, atLimit && styles.masterInfoDisabled]}>
                                        {activeJobs}/{maxJobs ?? '-'} {TRANSLATIONS[language].labelJobs}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                        ListEmptyComponent={(
                            <Text style={styles.noMasters}>
                                {assignMasterSearchLoading
                                    ? (TRANSLATIONS[language].loading || 'Loading...')
                                    : (TRANSLATIONS[language].noMasters || 'No masters found')}
                            </Text>
                        )}
                    />
                    <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAssignModal(false); setAssignTarget(null); setAssignMasterSearchQuery(''); }}>
                        <Text style={styles.modalCancelText}>{TRANSLATIONS[language].cancel}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const renderMasterDetailsModal = () => (
        <Modal visible={showMasterDetails} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.masterDetailsCard}>
                    <View style={styles.masterDetailsHeader}>
                        <Text style={styles.modalTitle}>{TRANSLATIONS[language].titleMasterDetails || 'Master Details'}</Text>
                        <TouchableOpacity onPress={closeMasterDetails} style={styles.masterDetailsCloseBtn}>
                            <Text style={styles.masterDetailsCloseText}>X</Text>
                        </TouchableOpacity>
                    </View>
                    {masterDetailsLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <View>
                            <Text style={styles.masterDetailsName}>
                                {masterDetails?.summary?.fullName || masterDetails?.profile?.full_name || '—'}
                            </Text>
                            <Text style={styles.masterDetailsSub}>
                                {masterDetails?.summary?.phone || masterDetails?.profile?.phone || '—'}
                            </Text>
                            <View style={styles.masterDetailsRow}>
                                <Text style={styles.masterDetailsLabel}>{TRANSLATIONS[language].prepaidBalance || 'Balance'}</Text>
                                <Text style={styles.masterDetailsValue}>{masterDetails?.summary?.prepaidBalance ?? 0}c</Text>
                            </View>
                            <View style={styles.masterDetailsRow}>
                                <Text style={styles.masterDetailsLabel}>{TRANSLATIONS[language].labelJobs || 'Jobs'}</Text>
                                <Text style={styles.masterDetailsValue}>{masterDetails?.summary?.completedJobs ?? 0}</Text>
                            </View>
                            {masterDetails?.summary?.balanceBlocked && (
                                <Text style={styles.masterDetailsBlocked}>{TRANSLATIONS[language].balanceBlocked || 'Balance Blocked'}</Text>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );

    // ============================================
    // MAIN RENDER
    // ============================================

    return (
        <LinearGradient colors={isDark ? ['#0f172a', '#1e293b'] : ['#f1f5f9', '#e2e8f0']} style={styles.container}>
            {renderSidebar()}
            {renderHeader()}
            {activeTab === 'stats' && renderStats()}
            {activeTab === 'queue' && renderQueue()}
            {activeTab === 'create' && renderCreateOrder()}
            {activeTab === 'settings' && renderSettings()}
            {renderAddMasterModal()}
            {renderDetailsDrawer()}
            {renderPaymentModal()}
            {renderAssignModal()}
            {renderMasterDetailsModal()}
            {renderPickerModal()}
        </LinearGradient>
    );
}



