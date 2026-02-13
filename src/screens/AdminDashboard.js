/**
 * Admin Dashboard - V5 High Fidelity
 * Replicates the "Deep Navy" web dashboard look with sidebar navigation and rich charts.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRoute } from '@react-navigation/native';

// Services & Context
import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import partnerFinanceService from '../services/partnerFinance';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import useDebouncedValue from './admin/hooks/useDebouncedValue';
import useAdminTabRouting from './admin/hooks/useAdminTabRouting';
import {
    ATTENTION_FILTER_OPTIONS,
    buildAdminMenuItems,
    INITIAL_ORDER_STATE,
    SERVICE_TYPES,
    SORT_OPTIONS,
    STATUS_OPTIONS,
    URGENCY_OPTIONS,
} from './admin/config/constants';

import styles from './admin/styles/dashboardStyles';
import {
    sanitizeNumberInput,
    formatNumber,
    formatMoney,
    formatPercent,
    formatShortDate,
    DAY_MS,
    calcStats,
    hoursSince,
    normalizeStatus,
    COMPLETED_STATUSES,
    CANCELED_STATUSES,
    isReopenableStatus,
    getAnalyticsColumns,
    AnalyticsMetricCard,
    AnalyticsListCard,
    InfoTip,
    StatusPie,
    StatusStrip,
    BoxPlotChart,
    LabeledBarChart,
} from './admin/components/analyticsShared';
import AdminSettingsTab from './admin/tabs/SettingsTab';
import AdminPeopleTab from './admin/tabs/PeopleTab';
import AdminAnalyticsTab from './admin/tabs/AnalyticsTab';
import AdminOrdersTab from './admin/tabs/OrdersTab';

// Components - Removed external Sidebar, using inline hamburger
import { StatCard } from '../components/ui/StatCard';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { Pagination } from '../components/ui/Pagination';
import { OrdersByService } from '../components/ui/OrdersByService';
import { StatusChart, CommissionWidget } from '../components/ui/DashboardCharts';
import { STATUS_COLORS, getOrderStatusLabel, getServiceLabel, getTimeAgo } from '../utils/orderHelpers';
import { normalizeKyrgyzPhone, isValidKyrgyzPhone } from '../utils/phone';

const LOG_PREFIX = '[AdminDashboard]';
const SCREEN_WIDTH = Dimensions.get('window').width;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PARTNER_HISTORY_PAGE_SIZE = 15;
const ADMIN_LOADING_HARD_TIMEOUT_MS = 20000;
const ADMIN_QUEUE_REQUEST_TIMEOUT_MS = Number(process?.env?.EXPO_PUBLIC_ADMIN_QUEUE_TIMEOUT_MS || 12000);
const ADMIN_QUEUE_TIMEOUT_TOAST_COOLDOWN_MS = 15000;
const parseMs = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};
const parsePositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
};
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const createEmptyNewUserData = () => ({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    service_area: '',
    max_active_jobs: '',
    max_immediate_orders: '',
    max_pending_confirmation: '',
    partner_commission_rate: '10',
    partner_min_payout: '50',
});
const createEmptyPartnerFinanceSummary = () => ({
    balance: 0,
    commissionRatePercent: 0,
    minPayout: 50,
    earnedTotal: 0,
    deductedTotal: 0,
    paidTotal: 0,
    requestedTotal: 0,
    pendingRequests: 0,
    transactions: [],
    payoutRequests: [],
});
const toFiniteNumberOrNull = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const parseDisputeClientNotes = (rawValue) => {
    const text = String(rawValue || '').trim();
    if (!text) {
        return {
            plainNotes: '',
            metadata: {},
            source: '',
            reportedBy: '',
            reporterRole: '',
            reportedFinalAmount: null,
            masterFinalAmount: null,
            workPerformed: '',
            hoursWorked: null,
        };
    }
    const chunks = text.split(';').map((chunk) => chunk.trim()).filter(Boolean);
    const metadata = {};
    const plain = [];
    chunks.forEach((chunk) => {
        const sepIndex = chunk.indexOf('=');
        if (sepIndex <= 0) {
            plain.push(chunk);
            return;
        }
        const key = chunk.slice(0, sepIndex).trim();
        const value = chunk.slice(sepIndex + 1).trim();
        if (!key) {
            plain.push(chunk);
            return;
        }
        metadata[key] = value;
    });
    const readText = (key) => String(metadata[key] || '').trim();
    return {
        plainNotes: plain.join('; '),
        metadata,
        source: readText('source'),
        reportedBy: readText('reported_by'),
        reporterRole: readText('reporter_role'),
        reportedFinalAmount: toFiniteNumberOrNull(readText('reported_final_amount')),
        masterFinalAmount: toFiniteNumberOrNull(readText('master_final_amount')),
        workPerformed: readText('work_performed'),
        hoursWorked: toFiniteNumberOrNull(readText('hours_worked')),
    };
};
const formatOrderRefLabel = (template, orderId) => {
    const fallbackTemplate = String(template || 'Order #{0}');
    const orderTail = String(orderId || '').trim();
    const displayRef = orderTail ? orderTail.slice(-8) : '-';
    return fallbackTemplate.includes('{0}')
        ? fallbackTemplate.replace('{0}', displayRef)
        : `${fallbackTemplate} ${displayRef}`;
};
const normalizeSearchTerm = (value) => String(value || '').trim().toLowerCase();
const normalizeSearchDigits = (value) => String(value || '').replace(/\D/g, '');
const optionMatchesSearch = (option, query, fields = []) => {
    const term = normalizeSearchTerm(query);
    const digits = normalizeSearchDigits(query);
    if (!term && !digits) return true;

    const candidateFields = (Array.isArray(fields) && fields.length > 0)
        ? fields
        : ['label', 'full_name', 'name', 'phone', 'email'];
    const hasTextMatch = candidateFields.some((field) => String(option?.[field] || '').toLowerCase().includes(term));
    if (hasTextMatch) return true;
    if (!digits) return false;
    return candidateFields.some((field) => normalizeSearchDigits(option?.[field]).includes(digits));
};
const ADMIN_TAB_KEYS = ['analytics', 'orders', 'people', 'create_order', 'disputes', 'payouts', 'settings'];
const ADMIN_DEFAULT_TAB_STALE_TTL_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_TAB_STALE_TTL_MS, 30000);
const ADMIN_TAB_STALE_TTL_MS = {
    analytics: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_ANALYTICS_STALE_TTL_MS, 20000),
    orders: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_ORDERS_STALE_TTL_MS, 15000),
    people: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_PEOPLE_STALE_TTL_MS, 30000),
    settings: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_SETTINGS_STALE_TTL_MS, 60000),
    create_order: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_CREATE_ORDER_STALE_TTL_MS, 45000),
    disputes: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_DISPUTES_STALE_TTL_MS, 15000),
    payouts: parseMs(process?.env?.EXPO_PUBLIC_ADMIN_PAYOUTS_STALE_TTL_MS, 15000),
};
const ADMIN_TAB_LOAD_TIMEOUT_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_TAB_LOAD_TIMEOUT_MS, 15000);
const ADMIN_TAB_INFLIGHT_STALE_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_TAB_INFLIGHT_STALE_MS, 18000);
const ADMIN_TAB_FORCE_JOIN_WINDOW_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_TAB_FORCE_JOIN_WINDOW_MS, 1200);
const ADMIN_PENDING_CREATED_ORDER_TTL_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_PENDING_CREATED_ORDER_TTL_MS, 120000);
const ADMIN_REALTIME_SYNC_ENABLED = process?.env?.EXPO_PUBLIC_ADMIN_REALTIME_SYNC !== '0';
const ADMIN_REALTIME_DEBOUNCE_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_REALTIME_DEBOUNCE_MS, 900);
const ADMIN_REALTIME_MIN_INTERVAL_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_REALTIME_MIN_INTERVAL_MS, 2500);
const ADMIN_CREATE_CONFIRM_RETRIES = parsePositiveInt(process?.env?.EXPO_PUBLIC_ADMIN_CREATE_CONFIRM_RETRIES, 4);
const ADMIN_CREATE_CONFIRM_DELAY_MS = parseMs(process?.env?.EXPO_PUBLIC_ADMIN_CREATE_CONFIRM_DELAY_MS, 850);
const ADMIN_DIAG_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === '1';
const DEFAULT_PAYMENT_CONFIRMATION_DATA = {
    finalAmount: '',
    reportReason: '',
    workPerformed: '',
    hoursWorked: '',
};
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
const adminDiag = (event, payload = null) => {
    if (!ADMIN_DIAG_ENABLED) return;
    if (payload === null) {
        console.log(`${LOG_PREFIX}[Diag] ${event}`);
        return;
    }
    console.log(`${LOG_PREFIX}[Diag] ${event}`, payload);
};

export default function AdminDashboard({ navigation }) {
    const route = useRoute();
    const { showToast } = useToast();
    const { translations, language, cycleLanguage, t } = useLocalization();
    const TRANSLATIONS = translations[language] || translations['en'] || {};
    const { logout, user: authUser } = useAuth();
    const { activeTab, setActiveTab } = useAdminTabRouting({
        navigation,
        routeParams: route?.params,
    });
    const analyticsLocale = useMemo(() => (language === 'ru' ? 'ru-RU' : language === 'kg' ? 'ky-KG' : 'en-US'), [language]);
    const isWeb = Platform.OS === 'web';
    const getLocalizedName = useCallback((item, fallback = '') => {
        if (!item) return fallback;
        const primary = language === 'ru' ? item.name_ru : language === 'kg' ? item.name_kg : item.name_en;
        const secondary = language === 'kg'
            ? (item.name_ru || item.name_en)
            : (item.name_en || item.name_ru || item.name_kg);
        return primary || secondary || item.label || item.code || item.id || fallback;
    }, [language]);

    // UI State
    const [isDark, setIsDark] = useState(true);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({});
    const [commissionStats, setCommissionStats] = useState({});
    const [balanceTopUpStats, setBalanceTopUpStats] = useState({ totalTopUps: 0, avgTopUp: 0, count: 0 });
    const [analyticsRange, setAnalyticsRange] = useState('30d');
    const [analyticsGranularity, setAnalyticsGranularity] = useState('day');
    const [analyticsSection, setAnalyticsSection] = useState('operations');
    const [analyticsFilters, setAnalyticsFilters] = useState({ urgency: 'all', service: 'all', area: 'all' });
    const [analyticsCustomRange, setAnalyticsCustomRange] = useState({ start: null, end: null });
    const [analyticsDispatcherId, setAnalyticsDispatcherId] = useState('all');
    const [analyticsMasterId, setAnalyticsMasterId] = useState('all');
    const [showAnalyticsStartPicker, setShowAnalyticsStartPicker] = useState(false);
    const [showAnalyticsEndPicker, setShowAnalyticsEndPicker] = useState(false);
    const [analyticsDetail, setAnalyticsDetail] = useState({ type: null });
    const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState(null);
    const [analyticsTooltip, setAnalyticsTooltip] = useState(null);
    const analyticsTooltipTimer = useRef(null);
    const [analyticsTrendTooltip, setAnalyticsTrendTooltip] = useState(null);
    const analyticsTrendTooltipTimer = useRef(null);
    const [analyticsNowTick, setAnalyticsNowTick] = useState(Date.now());
    const authSyncUserIdRef = useRef(null);
    const [priceDistRange, setPriceDistRange] = useState('30d');
    const [priceDistGrouping, setPriceDistGrouping] = useState('week');
    const [priceDistScope, setPriceDistScope] = useState('completed');
    const [priceDistChartWidth, setPriceDistChartWidth] = useState(0);
    const [priceDistTooltip, setPriceDistTooltip] = useState(null);
    const [priceDistGroupingNotice, setPriceDistGroupingNotice] = useState(null);

    // Data State
    const [orders, setOrders] = useState([]);
    const [queueOrders, setQueueOrders] = useState([]);
    const [queueTotalCount, setQueueTotalCount] = useState(0);
    const [queueStatusCountsState, setQueueStatusCountsState] = useState(null);
    const [queueAttentionItemsState, setQueueAttentionItemsState] = useState([]);
    const [queueAttentionCountState, setQueueAttentionCountState] = useState(0);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueSource, setQueueSource] = useState('init');
    const [masters, setMasters] = useState([]);
    const [dispatchers, setDispatchers] = useState([]);
    const [partners, setPartners] = useState([]);
    const [adminUsers, setAdminUsers] = useState([]);
    const [disputes, setDisputes] = useState([]);
    const [adminPayoutRequests, setAdminPayoutRequests] = useState([]);
    const [adminPayoutStatusFilter, setAdminPayoutStatusFilter] = useState('requested');
    const [adminPayoutActionId, setAdminPayoutActionId] = useState(null);
    const [settings, setSettings] = useState({});
    const [tempSettings, setTempSettings] = useState({});
    const [user, setUser] = useState(null);

    // Filter & Search State
    const [dashboardFilter, setDashboardFilter] = useState({ type: 'all' });
    const [searchQuery, setSearchQuery] = useState('');
    const [queueSearch, setQueueSearch] = useState('');
    const queueSearchDebounced = useDebouncedValue(queueSearch.trim(), 240);
    const [peopleView, setPeopleView] = useState('masters'); // 'masters' | 'staff' | 'partners'
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    // Modals
    const [selectedMaster, setSelectedMaster] = useState(null);

    // Sidebar State (hamburger menu)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Orders View Mode
    const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'compact'
    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState('Active');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [filterDispatcher, setFilterDispatcher] = useState('all');
    const [filterUrgency, setFilterUrgency] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');
    const [queuePage, setQueuePage] = useState(1);
    const queuePageSize = useMemo(() => (viewMode === 'cards' ? 20 : 10), [viewMode]);

    // Needs Attention Section State
    const [showNeedsAttention, setShowNeedsAttention] = useState(true);
    const [filterAttentionType, setFilterAttentionType] = useState('All');
    const [sortOrder, setSortOrder] = useState('newest');

    const [pickerModal, setPickerModal] = useState({
        visible: false,
        options: [],
        value: '',
        onChange: null,
        title: '',
        searchable: false,
        searchFields: ['label'],
        searchPlaceholder: '',
        onSearch: null,
        emptyText: '',
        closeOnSelect: true,
    });
    const [pickerSearchQuery, setPickerSearchQuery] = useState('');
    const pickerSearchDebounced = useDebouncedValue(pickerSearchQuery.trim(), 220);
    const [pickerSearchLoading, setPickerSearchLoading] = useState(false);
    const [pickerRemoteOptions, setPickerRemoteOptions] = useState(null);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [managedDistricts, setManagedDistricts] = useState([]);
    const [cancellationReasons, setCancellationReasons] = useState([]);
    const [serviceTypeModal, setServiceTypeModal] = useState({ visible: false, type: null });
    const [tempServiceType, setTempServiceType] = useState({
        code: '',
        name_en: '',
        name_ru: '',
        name_kg: '',
        sort_order: '',
        is_active: true,
    });
    const [districtModal, setDistrictModal] = useState({ visible: false, district: null });
    const [tempDistrict, setTempDistrict] = useState({ code: '', name_en: '', name_ru: '', name_kg: '', region: '', sort_order: '', is_active: true });
    const [cancellationReasonModal, setCancellationReasonModal] = useState({ visible: false, reason: null });
    const [tempCancellationReason, setTempCancellationReason] = useState({
        code: '',
        name_en: '',
        name_ru: '',
        name_kg: '',
        applicable_to: 'both',
        sort_order: '',
        is_active: true,
    });
    const [districtSearch, setDistrictSearch] = useState('');
    const [cancellationSearch, setCancellationSearch] = useState('');
    const [serviceTypesCollapsed, setServiceTypesCollapsed] = useState(true);
    const [districtsCollapsed, setDistrictsCollapsed] = useState(true);
    const [cancellationReasonsCollapsed, setCancellationReasonsCollapsed] = useState(true);
    const [configurationCollapsed, setConfigurationCollapsed] = useState(true);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, peopleView]);

    useEffect(() => {
        if (!pickerModal.visible) {
            pickerSearchSeqRef.current += 1;
            setPickerSearchQuery('');
            setPickerRemoteOptions(null);
            setPickerSearchLoading(false);
            return;
        }
        setPickerSearchQuery('');
        setPickerRemoteOptions(null);
        setPickerSearchLoading(false);
    }, [pickerModal.visible]);

    useEffect(() => {
        if (!pickerModal.visible || !pickerModal.searchable || typeof pickerModal.onSearch !== 'function') {
            return;
        }
        const query = normalizeSearchTerm(pickerSearchDebounced);
        if (!query || query.length < 2) {
            pickerSearchSeqRef.current += 1;
            setPickerRemoteOptions(null);
            setPickerSearchLoading(false);
            return;
        }

        let cancelled = false;
        const requestId = pickerSearchSeqRef.current + 1;
        pickerSearchSeqRef.current = requestId;
        setPickerSearchLoading(true);

        Promise.resolve(pickerModal.onSearch(query))
            .then((data) => {
                if (cancelled || requestId !== pickerSearchSeqRef.current) return;
                setPickerRemoteOptions(Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                if (cancelled || requestId !== pickerSearchSeqRef.current) return;
                console.error(`${LOG_PREFIX} picker remote search failed`, error);
                setPickerRemoteOptions([]);
            })
            .finally(() => {
                if (cancelled || requestId !== pickerSearchSeqRef.current) return;
                setPickerSearchLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [pickerModal.visible, pickerModal.searchable, pickerModal.onSearch, pickerSearchDebounced]);

    const pickerSearchFields = useMemo(() => (
        Array.isArray(pickerModal.searchFields) && pickerModal.searchFields.length > 0
            ? pickerModal.searchFields
            : ['label']
    ), [pickerModal.searchFields]);

    const pickerVisibleOptions = useMemo(() => {
        const base = Array.isArray(pickerRemoteOptions)
            ? pickerRemoteOptions
            : (Array.isArray(pickerModal.options) ? pickerModal.options : []);
        if (!pickerModal.searchable) return base;
        const query = normalizeSearchTerm(pickerSearchDebounced);
        if (!query) return base;
        return base.filter((option) => optionMatchesSearch(option, query, pickerSearchFields));
    }, [pickerModal.options, pickerModal.searchable, pickerRemoteOptions, pickerSearchDebounced, pickerSearchFields]);

    const openDistrictPicker = () => {
        setPickerModal({
            visible: true,
            title: TRANSLATIONS.createDistrict || 'District',
            value: newOrder.area,
            options: districts.map(d => ({ id: d.id, label: d.label })),
            onChange: (val) => setNewOrder(prev => ({ ...prev, area: val }))
        });
    };

    const openEditDistrictPicker = () => {
        setPickerModal({
            visible: true,
            title: TRANSLATIONS.createDistrict || 'District',
            value: editForm.area,
            options: districts.map(d => ({ id: d.id, label: d.label })),
            onChange: (val) => setEditForm(prev => ({ ...prev, area: val }))
        });
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
    // FILTERING (Orders Queue)
    // ============================================

    const dispatcherFilterOptions = useMemo(() => {
        const baseOptions = [
            { id: 'all', label: TRANSLATIONS.filterAllOrders || 'All Orders' },
            { id: 'unassigned', label: TRANSLATIONS.unassigned || 'Unassigned' },
        ];
        const byProfiles = [...(dispatchers || []), ...(adminUsers || [])].map(d => ({
            id: String(d.id),
            label: d.full_name || d.name || d.phone || d.email || `Dispatcher ${d.id}`,
            full_name: d.full_name || d.name || '',
            phone: d.phone || '',
            email: d.email || '',
            role: d.role || '',
        }));
        const byOrders = orders
            .filter(o => o.dispatcher_id || o.dispatcher?.id || o.assigned_dispatcher_id || o.assigned_dispatcher?.id)
            .map(o => ({
                id: String(o.assigned_dispatcher_id || o.assigned_dispatcher?.id || o.dispatcher_id || o.dispatcher?.id),
                label: o.assigned_dispatcher?.full_name || o.dispatcher?.full_name || `Dispatcher ${o.assigned_dispatcher_id || o.assigned_dispatcher?.id || o.dispatcher_id || o.dispatcher?.id}`,
                full_name: o.assigned_dispatcher?.full_name || o.dispatcher?.full_name || '',
                phone: o.assigned_dispatcher?.phone || o.dispatcher?.phone || '',
                email: o.assigned_dispatcher?.email || o.dispatcher?.email || '',
            }));
        const merged = new Map();
        [...byProfiles, ...byOrders].forEach(opt => {
            if (opt?.id && !merged.has(opt.id)) merged.set(opt.id, opt);
        });
        return baseOptions.concat(Array.from(merged.values()));
    }, [dispatchers, adminUsers, orders, language, TRANSLATIONS.filterAllOrders, TRANSLATIONS.unassigned]);

    const serviceFilterOptions = useMemo(() => ([
        { id: 'all', label: TRANSLATIONS.labelAllServices || TRANSLATIONS.statusAll || 'All Services' },
        ...serviceTypes.map(st => ({
            id: st.code || st.id,
            label: st[`name_${language}`] || st.name_en || st.name_ru || st.name_kg || st.code || st.id,
        })),
    ]), [serviceTypes, language]);

    const districtLookup = useMemo(() => {
        const source = managedDistricts?.length ? managedDistricts : districts;
        const map = new Map();
        (source || []).forEach(district => {
            [district?.id, district?.code, district?.label, district?.name_en, district?.name_ru, district?.name_kg]
                .filter(Boolean)
                .forEach(key => {
                    const normalized = String(key).trim().toLowerCase();
                    if (!map.has(normalized)) map.set(normalized, district);
                });
        });
        return map;
    }, [managedDistricts, districts]);

    const cancellationReasonLookup = useMemo(() => {
        const map = new Map();
        (cancellationReasons || []).forEach(reason => {
            [reason?.code, reason?.id, reason?.value, reason?.label, reason?.name_en, reason?.name_ru, reason?.name_kg]
                .filter(Boolean)
                .forEach(key => {
                    const normalized = String(key);
                    if (!map.has(normalized)) map.set(normalized, reason);
                });
        });
        return map;
    }, [cancellationReasons]);

    const getAreaLabel = useCallback((area) => {
        if (!area) return '';
        const raw = String(area).trim();
        const normalized = raw.toLowerCase();
        const district = districtLookup.get(normalized);
        if (district) return getLocalizedName(district, raw);
        const normalizedParts = raw.split(/\u2014|-/).map((part) => part.trim()).filter(Boolean);
        if (normalizedParts.length > 1) {
            const tail = normalizedParts[normalizedParts.length - 1].toLowerCase();
            const tailDistrict = districtLookup.get(tail);
            if (tailDistrict) {
                return `${normalizedParts.slice(0, -1).join(' - ')} - ${getLocalizedName(tailDistrict, normalizedParts[normalizedParts.length - 1])}`;
            }
        }
        const parts = raw.split(/[—-]/).map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) {
            const tail = parts[parts.length - 1].toLowerCase();
            const tailDistrict = districtLookup.get(tail);
            if (tailDistrict) {
                return `${parts.slice(0, -1).join(' - ')} - ${getLocalizedName(tailDistrict, parts[parts.length - 1])}`;
            }
        }
        return raw;
    }, [districtLookup, getLocalizedName]);

    const getAreaFilterKey = useCallback((area) => {
        if (!area) return '';
        const raw = String(area).trim();
        const normalized = raw.toLowerCase();
        const district = districtLookup.get(normalized);
        if (district) {
            return String(district.code || district.id || raw).trim().toLowerCase();
        }
        const parts = raw.split(/\u2014|-/).map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) {
            const tail = parts[parts.length - 1].toLowerCase();
            const tailDistrict = districtLookup.get(tail);
            if (tailDistrict) {
                return String(tailDistrict.code || tailDistrict.id || tail).trim().toLowerCase();
            }
        }
        return normalized;
    }, [districtLookup]);

    const getCancelReasonLabel = useCallback((code) => {
        if (!code || code === 'unknown') return TRANSLATIONS.analyticsUnknown || 'Unknown';
        const key = String(code);
        const reason = cancellationReasonLookup.get(key);
        return getLocalizedName(reason, key);
    }, [cancellationReasonLookup, getLocalizedName, TRANSLATIONS]);

    const analyticsAreaOptions = useMemo(() => {
        const districtSource = (managedDistricts?.length ? managedDistricts : districts) || [];
        const activeDistrictIds = districtSource
            .filter((district) => district && district.is_active !== false)
            .map((district) => getAreaFilterKey(
                district.code || district.id || district.label || district.name_en || district.name_ru || district.name_kg
            ))
            .filter(Boolean);
        const fallbackOrderAreaIds = (orders || [])
            .map((order) => getAreaFilterKey(order?.area))
            .filter(Boolean)
            .map((value) => String(value).trim());
        const areaIds = Array.from(new Set(
            activeDistrictIds.length > 0 ? activeDistrictIds : fallbackOrderAreaIds
        )).sort((a, b) => String(getAreaLabel(a) || a).localeCompare(String(getAreaLabel(b) || b)));
        const areas = areaIds.map(id => ({
            id,
            label: getAreaLabel(id) || id,
        }));
        return [{ id: 'all', label: TRANSLATIONS.filterAll || 'All' }, ...areas];
    }, [managedDistricts, districts, orders, getAreaLabel, getAreaFilterKey, TRANSLATIONS.filterAll]);

    const matchesDispatcher = useCallback((order, dispatcherId) => {
        if (!order) return false;
        const createdId = order.dispatcher_id ? String(order.dispatcher_id) : null;
        const assignedId = order.assigned_dispatcher_id ? String(order.assigned_dispatcher_id) : createdId;
        if (dispatcherId === 'all') return !!(createdId || assignedId);
        const target = String(dispatcherId);
        return createdId === target || assignedId === target;
    }, []);

    const matchesMaster = useCallback((order, masterId) => {
        if (!order) return false;
        const assignedId = order.master?.id || order.master_id;
        if (!assignedId) return false;
        if (masterId === 'all') return true;
        return String(assignedId) === String(masterId);
    }, []);

    const analyticsDispatcherOptions = useMemo(() => {
        const roleLabel = (role) => {
            if (!role) return '';
            if (role === 'admin') {
                return TRANSLATIONS.adminRole || TRANSLATIONS.admin || 'Admin';
            }
            if (role === 'dispatcher') {
                return TRANSLATIONS.dispatcherRole || TRANSLATIONS.analyticsDispatcher || 'Dispatcher';
            }
            return role;
        };

        const map = new Map();
        const addOption = (id, name, role, phone, email) => {
            if (!id) return;
            const key = String(id);
            if (map.has(key)) return;
            const roleName = roleLabel(role);
            const displayName = name || (roleName ? `${roleName} ${key.slice(0, 6)}` : `User ${key.slice(0, 6)}`);
            const label = roleName ? `${displayName} (${roleName})` : displayName;
            map.set(key, {
                id: key,
                label,
                full_name: String(name || ''),
                phone: String(phone || ''),
                email: String(email || ''),
                role: String(role || ''),
                role_label: roleName,
            });
        };

        (dispatchers || []).forEach(d => addOption(d.id, d.full_name || d.name || d.phone || d.email, d.role || 'dispatcher', d.phone, d.email));
        (adminUsers || []).forEach(a => addOption(a.id, a.full_name || a.name || a.phone || a.email, a.role || 'admin', a.phone, a.email));
        (orders || []).forEach(o => {
            addOption(o.dispatcher_id, o.dispatcher?.full_name, 'dispatcher', o.dispatcher?.phone, o.dispatcher?.email);
            addOption(o.assigned_dispatcher_id, o.assigned_dispatcher?.full_name, 'dispatcher', o.assigned_dispatcher?.phone, o.assigned_dispatcher?.email);
        });

        const sorted = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
        return [{ id: 'all', label: TRANSLATIONS.analyticsAllDispatchers || 'All dispatchers' }, ...sorted];
    }, [dispatchers, adminUsers, orders, TRANSLATIONS, language]);

    const analyticsMasterOptions = useMemo(() => {
        const map = new Map();
        const addOption = (id, name, phone, email) => {
            if (!id) return;
            const key = String(id);
            if (map.has(key)) return;
            const displayName = name || `Master ${key.slice(0, 6)}`;
            map.set(key, {
                id: key,
                label: displayName,
                full_name: String(name || ''),
                phone: String(phone || ''),
                email: String(email || ''),
                role: 'master',
            });
        };

        (masters || []).forEach(m => addOption(m.id, m.full_name || m.name || m.phone || m.email, m.phone, m.email));
        (orders || []).forEach(o => addOption(
            o.master?.id || o.master_id,
            o.master?.full_name || o.master_name,
            o.master?.phone,
            o.master?.email
        ));

        const sorted = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
        return [{ id: 'all', label: TRANSLATIONS.analyticsAllMasters || 'All masters' }, ...sorted];
    }, [masters, orders, TRANSLATIONS]);

    const searchAnalyticsDispatcherOptions = useCallback(async (queryText) => {
        const query = normalizeSearchTerm(queryText);
        if (!query) return analyticsDispatcherOptions;
        if (query.length < 2) {
            return analyticsDispatcherOptions.filter((option) => optionMatchesSearch(option, query, ['label', 'full_name', 'phone', 'email', 'role_label']));
        }

        const roleLabel = (role) => {
            if (role === 'admin') return TRANSLATIONS.adminRole || TRANSLATIONS.admin || 'Admin';
            return TRANSLATIONS.dispatcherRole || TRANSLATIONS.analyticsDispatcher || 'Dispatcher';
        };
        const map = new Map();
        const addOption = (entity, fallbackRole) => {
            if (!entity?.id) return;
            const key = String(entity.id);
            if (map.has(key)) return;
            const role = String(entity.role || fallbackRole || 'dispatcher');
            const roleName = roleLabel(role);
            const fullName = entity.full_name || entity.name || entity.phone || entity.email || `${roleName} ${key.slice(0, 6)}`;
            map.set(key, {
                id: key,
                label: roleName ? `${fullName} (${roleName})` : fullName,
                full_name: entity.full_name || entity.name || '',
                phone: entity.phone || '',
                email: entity.email || '',
                role,
                role_label: roleName,
            });
        };

        try {
            const [dispatcherData, adminData] = await Promise.all([
                authService.getAllDispatchers ? authService.getAllDispatchers({ search: query, force: true, pageSize: 80 }) : Promise.resolve([]),
                authService.getAllAdmins ? authService.getAllAdmins({ search: query, force: true, pageSize: 80 }) : Promise.resolve([]),
            ]);
            (dispatcherData || []).forEach((item) => addOption(item, 'dispatcher'));
            (adminData || []).forEach((item) => addOption(item, 'admin'));
        } catch (error) {
            console.error(`${LOG_PREFIX} analytics dispatcher search failed`, error);
        }

        const remoteOptions = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
        if (remoteOptions.length > 0) {
            return [{ id: 'all', label: TRANSLATIONS.analyticsAllDispatchers || 'All dispatchers' }, ...remoteOptions];
        }
        return analyticsDispatcherOptions.filter((option) => optionMatchesSearch(option, query, ['label', 'full_name', 'phone', 'email', 'role_label']));
    }, [analyticsDispatcherOptions, TRANSLATIONS]);

    const searchAnalyticsMasterOptions = useCallback(async (queryText) => {
        const query = normalizeSearchTerm(queryText);
        if (!query) return analyticsMasterOptions;
        if (query.length < 2) {
            return analyticsMasterOptions.filter((option) => optionMatchesSearch(option, query, ['label', 'full_name', 'phone', 'email']));
        }

        try {
            const remote = await authService.getAllMasters({ search: query, force: true, pageSize: 80 });
            const mapped = (remote || [])
                .filter((item) => item?.id)
                .map((item) => ({
                    id: String(item.id),
                    label: item.full_name || item.name || item.phone || item.email || `Master ${String(item.id).slice(0, 6)}`,
                    full_name: item.full_name || item.name || '',
                    phone: item.phone || '',
                    email: item.email || '',
                    role: 'master',
                }))
                .sort((a, b) => a.label.localeCompare(b.label));
            if (mapped.length > 0) {
                return [{ id: 'all', label: TRANSLATIONS.analyticsAllMasters || 'All masters' }, ...mapped];
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} analytics master search failed`, error);
        }

        return analyticsMasterOptions.filter((option) => optionMatchesSearch(option, query, ['label', 'full_name', 'phone', 'email']));
    }, [analyticsMasterOptions, TRANSLATIONS]);

    const analyticsRangeWindow = useMemo(() => {
        if (analyticsRange === 'all') return null;
        const now = new Date();
        if (analyticsRange === 'custom') {
            if (!analyticsCustomRange.start || !analyticsCustomRange.end) return null;
            const start = new Date(analyticsCustomRange.start);
            const end = new Date(analyticsCustomRange.end);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { start, end };
        }
        const start = new Date(now);
        if (analyticsRange === 'today') start.setHours(0, 0, 0, 0);
        else if (analyticsRange === '7d') start.setDate(start.getDate() - 7);
        else if (analyticsRange === '30d') start.setDate(start.getDate() - 30);
        else if (analyticsRange === '90d') start.setDate(start.getDate() - 90);
        return { start, end: now };
    }, [analyticsRange, analyticsCustomRange]);

    const analyticsFilteredOrders = useMemo(() => {
        return orders.filter(order => {
            if (!order) return false;
            if (analyticsFilters.urgency !== 'all' && order.urgency !== analyticsFilters.urgency) return false;
            if (analyticsFilters.service !== 'all' && order.service_type !== analyticsFilters.service) return false;
            if (
                analyticsFilters.area !== 'all'
                && getAreaFilterKey(order.area) !== String(analyticsFilters.area || '').trim().toLowerCase()
            ) return false;
            return true;
        });
    }, [orders, analyticsFilters, getAreaFilterKey]);

    const analyticsOrders = useMemo(() => {
        return analyticsFilteredOrders.filter(order => {
            if (!analyticsRangeWindow) return true;
            const stamp = order.completed_at || order.confirmed_at || order.updated_at || order.created_at;
            if (!stamp) return true;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return true;
            return ts >= analyticsRangeWindow.start && ts <= analyticsRangeWindow.end;
        });
    }, [analyticsFilteredOrders, analyticsRangeWindow]);

    const dispatcherFilteredOrders = useMemo(() => {
        return analyticsOrders.filter(order => matchesDispatcher(order, analyticsDispatcherId));
    }, [analyticsOrders, analyticsDispatcherId, matchesDispatcher]);

    const masterFilteredOrders = useMemo(() => {
        return analyticsOrders.filter(order => matchesMaster(order, analyticsMasterId));
    }, [analyticsOrders, analyticsMasterId, matchesMaster]);

    const analyticsStats = useMemo(() => {
        const totalOrders = analyticsOrders.length;
        const completedOrders = analyticsOrders.filter(o => COMPLETED_STATUSES.has(normalizeStatus(o.status))).length;
        const canceledOrders = analyticsOrders.filter(o => CANCELED_STATUSES.has(normalizeStatus(o.status))).length;
        const openOrders = analyticsOrders.filter(o => !COMPLETED_STATUSES.has(normalizeStatus(o.status)) && !CANCELED_STATUSES.has(normalizeStatus(o.status)));
        const gmv = analyticsOrders.reduce((sum, o) => {
            if (!COMPLETED_STATUSES.has(normalizeStatus(o.status))) return sum;
            const price = Number(o.final_price ?? o.initial_price ?? o.callout_fee ?? 0);
            return sum + (Number.isFinite(price) ? price : 0);
        }, 0);
        const avgTicket = completedOrders ? gmv / completedOrders : 0;
        const cancelRate = totalOrders ? canceledOrders / totalOrders : 0;
        const completionRate = totalOrders ? completedOrders / totalOrders : 0;
        const urgentCount = analyticsOrders.filter(o => o.urgency === 'urgent').length;
        const emergencyCount = analyticsOrders.filter(o => o.urgency === 'emergency').length;
        const plannedCount = analyticsOrders.filter(o => o.urgency === 'planned').length;
        const urgentShare = totalOrders ? (urgentCount + emergencyCount) / totalOrders : 0;
        const openAges = openOrders.map(o => hoursSince(o.created_at)).filter(v => Number.isFinite(v));
        const avgOpenAge = openAges.length ? openAges.reduce((a, b) => a + b, 0) / openAges.length : null;
        const oldestOpenAge = openAges.length ? Math.max(...openAges) : null;
        const openOlder24h = openAges.filter(age => age > 24).length;
        const openOlder48h = openAges.filter(age => age > 48).length;
        const claimedCount = analyticsOrders.filter(o => normalizeStatus(o.status) === 'claimed').length;
        const startedCount = analyticsOrders.filter(o => normalizeStatus(o.status) === 'started').length;
        const inProgress = claimedCount + startedCount;
        const reopenedCount = analyticsOrders.filter(o => normalizeStatus(o.status) === 'reopened').length;
        const reopenRate = totalOrders ? reopenedCount / totalOrders : 0;
        const activeJobs = analyticsOrders.filter(o => ['claimed', 'started', 'wip'].includes(normalizeStatus(o.status))).length;
        const availablePool = analyticsOrders.filter(o => ['placed', 'reopened'].includes(normalizeStatus(o.status))).length;
        const statusBreakdown = {
            open: availablePool,
            active: activeJobs,
            completed: completedOrders,
            canceled: canceledOrders,
        };

        const commissionRate = Number(settings?.commission_rate) || 0;
        const confirmedOrdersList = analyticsOrders.filter(o => normalizeStatus(o.status) === 'confirmed');
        const completedUnconfirmedList = analyticsOrders.filter(o => normalizeStatus(o.status) === 'completed');
        const commissionCollected = confirmedOrdersList.reduce((sum, o) => {
            const price = Number(o.final_price ?? o.initial_price ?? o.callout_fee ?? 0);
            return sum + (Number.isFinite(price) ? price * commissionRate : 0);
        }, 0);
        const commissionOwed = completedUnconfirmedList.reduce((sum, o) => {
            const price = Number(o.final_price ?? o.initial_price ?? o.callout_fee ?? 0);
            return sum + (Number.isFinite(price) ? price * commissionRate : 0);
        }, 0);
        const avgCommissionPerOrder = confirmedOrdersList.length ? commissionCollected / confirmedOrdersList.length : 0;

        const totalBalances = masters.reduce((sum, m) => sum + (m.prepaid_balance || 0), 0);
        const avgBalance = masters.length ? totalBalances / masters.length : 0;
        const lowBalanceCount = masters.filter(m => (m.prepaid_balance || 0) < 500).length;

        const avgOrderValueForLost = avgTicket || 0;
        let lostEarningsTotal = 0;
        let lostEarningsCount = 0;

        analyticsOrders.forEach(order => {
            const status = normalizeStatus(order.status);
            if (!CANCELED_STATUSES.has(status)) return;
            if (status === 'canceled_by_admin') return;

            if (status === 'canceled_by_master') {
                const reason = String(order.cancellation_reason || '').toLowerCase();
                if (reason.includes('reopen') || reason.includes('dispatcher') || reason.includes('admin')) {
                    return;
                }
                lostEarningsTotal += avgOrderValueForLost;
                lostEarningsCount += 1;
                return;
            }

            const price = Number(order.final_price ?? order.initial_price ?? order.callout_fee ?? 0);
            if (Number.isFinite(price) && price > 0) {
                lostEarningsTotal += price;
            } else if (avgOrderValueForLost) {
                lostEarningsTotal += avgOrderValueForLost;
            }
            lostEarningsCount += 1;
        });
        const lostEarningsAvg = lostEarningsCount ? lostEarningsTotal / lostEarningsCount : 0;

        return {
            totalOrders,
            completedOrders,
            canceledOrders,
            openOrders: openOrders.length,
            gmv,
            avgTicket,
            cancelRate,
            completionRate,
            urgentCount,
            emergencyCount,
            plannedCount,
            urgentShare,
            avgOpenAge,
            oldestOpenAge,
            openOlder24h,
            openOlder48h,
            claimedCount,
            startedCount,
            inProgress,
            reopenedCount,
            reopenRate,
            activeJobs,
            availablePool,
            commissionCollected,
            avgCommissionPerOrder,
            commissionOwed,
            commissionOwedCount: completedUnconfirmedList.length,
            lostEarningsTotal,
            lostEarningsCount,
            lostEarningsAvg,
            totalBalances,
            avgBalance,
            lowBalanceCount,
            topUpTotal: Number(balanceTopUpStats.totalTopUps || 0),
            topUpAvg: Number(balanceTopUpStats.avgTopUp || 0),
            topUpCount: Number(balanceTopUpStats.count || 0),
            statusBreakdown,
        };
    }, [analyticsOrders, masters, balanceTopUpStats, settings, analyticsNowTick]);

    const analyticsLists = useMemo(() => {
        const hoursUnit = TRANSLATIONS.analyticsHoursUnit || 'hours';
        const buildTopList = (entries) => {
            const sorted = [...entries].sort((a, b) => b.count - a.count);
            const sliced = sorted.slice(0, 6);
            const max = Math.max(...sliced.map(item => item.count), 1);
            return sliced.map(item => ({
                label: item.label,
                value: formatNumber(item.count),
                ratio: item.count / max,
                count: item.count,
            }));
        };

        const areaCounts = {};
        const serviceCounts = {};
        const urgencyCounts = { emergency: 0, urgent: 0, planned: 0 };
        analyticsOrders.forEach(order => {
            if (order.area) areaCounts[order.area] = (areaCounts[order.area] || 0) + 1;
            if (order.service_type) serviceCounts[order.service_type] = (serviceCounts[order.service_type] || 0) + 1;
            if (order.urgency && urgencyCounts[order.urgency] !== undefined) urgencyCounts[order.urgency] += 1;
        });

        const topAreas = buildTopList(Object.entries(areaCounts).map(([label, count]) => ({
            label: getAreaLabel(label),
            count,
        })));
        const topServices = buildTopList(Object.entries(serviceCounts).map(([label, count]) => ({
            label: getServiceLabel(label, t),
            count,
        })));
        const urgencyPriority = { emergency: 3, urgent: 2, planned: 1 };
        const urgencyItems = [
            { key: 'emergency', label: TRANSLATIONS.urgencyEmergency || 'Emergency', count: urgencyCounts.emergency },
            { key: 'urgent', label: TRANSLATIONS.urgencyUrgent || 'Urgent', count: urgencyCounts.urgent },
            { key: 'planned', label: TRANSLATIONS.urgencyPlanned || 'Planned', count: urgencyCounts.planned },
        ].sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            const aPriority = urgencyPriority[a.key] || 0;
            const bPriority = urgencyPriority[b.key] || 0;
            return bPriority - aPriority;
        });
        const maxUrgency = Math.max(...urgencyItems.map(item => item.count), 1);
        const urgencyMix = urgencyItems.map(item => ({
            label: item.label,
            value: formatNumber(item.count),
            ratio: item.count / maxUrgency,
            count: item.count,
        }));

        const cancelCounts = {};
        analyticsOrders.forEach(order => {
            if (!CANCELED_STATUSES.has(normalizeStatus(order.status))) return;
            const code = order.cancel_reason_code || order.cancel_reason || order.cancellation_reason;
            const normalized = code ? String(code) : 'unknown';
            cancelCounts[normalized] = (cancelCounts[normalized] || 0) + 1;
        });
        const cancelReasons = buildTopList(Object.entries(cancelCounts).map(([code, count]) => ({
            label: getCancelReasonLabel(code),
            count,
        })));

        const backlogOrders = analyticsOrders
            .filter(order => !COMPLETED_STATUSES.has(normalizeStatus(order.status)) && !CANCELED_STATUSES.has(normalizeStatus(order.status)))
            .map(order => {
                const age = hoursSince(order.created_at);
                return {
                    label: `${getServiceLabel(order.service_type, t)} - ${getAreaLabel(order.area) || '-'}`,
                    value: age ? `${age.toFixed(1)} ${hoursUnit}` : '-',
                    subLabel: order.urgency ? (TRANSLATIONS[`urgency${order.urgency.charAt(0).toUpperCase() + order.urgency.slice(1)}`] || order.urgency) : null,
                    age: age ?? 0,
                };
            })
            .sort((a, b) => b.age - a.age)
            .slice(0, 12);

        const funnelStatuses = ['placed', 'claimed', 'started', 'completed', 'confirmed', 'canceled'];
        const funnel = funnelStatuses.map(status => {
            const count = analyticsOrders.filter(order => normalizeStatus(order.status) === status || (status === 'canceled' && CANCELED_STATUSES.has(normalizeStatus(order.status)))).length;
            return {
                label: getOrderStatusLabel(status, t) || status,
                value: formatNumber(count),
                ratio: count,
                count,
            };
        });
        const maxFunnel = Math.max(...funnel.map(item => item.count), 1);
        const funnelWithRatio = funnel.map(item => ({
            ...item,
            ratio: item.count / maxFunnel,
        }));

        return {
            topAreas,
            topServices,
            urgencyMix,
            cancelReasons,
            backlogOrders,
            funnel: funnelWithRatio,
        };
    }, [analyticsOrders, t, TRANSLATIONS, getAreaLabel, getCancelReasonLabel, analyticsNowTick]);

    const analyticsDailySeries = useMemo(() => {
        const ordersSeries = Array(7).fill(0);
        const completedSeries = Array(7).fill(0);
        const revenueSeries = Array(7).fill(0);
        const commissionSeries = Array(7).fill(0);
        const commissionRate = Number(settings?.commission_rate) || 0;
        const now = new Date();
        analyticsOrders.forEach(order => {
            const stamp = order.created_at || order.updated_at;
            if (!stamp) return;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return;
            const diffDays = Math.floor((now.getTime() - ts.getTime()) / 86400000);
            if (diffDays >= 0 && diffDays < 7) {
                const idx = 6 - diffDays;
                ordersSeries[idx] += 1;
                const normalized = normalizeStatus(order.status);
                if (COMPLETED_STATUSES.has(normalized)) {
                    completedSeries[idx] += 1;
                    const price = Number(order.final_price ?? order.initial_price ?? 0);
                    if (Number.isFinite(price)) {
                        revenueSeries[idx] += price;
                        if (normalized === 'confirmed') {
                            commissionSeries[idx] += price * commissionRate;
                        }
                    }
                }
            }
        });
        return { ordersSeries, completedSeries, revenueSeries, commissionSeries, commissionRate };
    }, [analyticsOrders, settings]);

    const analyticsChartSeries = useMemo(() => {
        const locale = language === 'ru' ? 'ru-RU' : language === 'kg' ? 'ky-KG' : 'en-US';
        const now = new Date();
        const commissionRate = Number(settings?.commission_rate) || 0;

        const startOfWeek = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const buildBuckets = () => {
            const buckets = [];
            if (analyticsGranularity === 'hour') {
                const base = new Date(now);
                base.setMinutes(0, 0, 0);
                for (let i = 11; i >= 0; i -= 1) {
                    const start = new Date(base);
                    start.setHours(base.getHours() - i);
                    const end = new Date(start);
                    end.setHours(start.getHours() + 1);
                    end.setMilliseconds(end.getMilliseconds() - 1);
                    buckets.push({
                        start: start.getTime(),
                        end: end.getTime(),
                        label: start.toLocaleTimeString(locale, { hour: '2-digit' }),
                    });
                }
                return buckets;
            }
            if (analyticsGranularity === 'week') {
                const base = startOfWeek(now);
                for (let i = 7; i >= 0; i -= 1) {
                    const start = new Date(base);
                    start.setDate(base.getDate() - i * 7);
                    const end = new Date(start);
                    end.setDate(start.getDate() + 7);
                    end.setMilliseconds(end.getMilliseconds() - 1);
                    buckets.push({
                        start: start.getTime(),
                        end: end.getTime(),
                        label: start.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
                    });
                }
                return buckets;
            }
            if (analyticsGranularity === 'month') {
                for (let i = 11; i >= 0; i -= 1) {
                    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
                    end.setMilliseconds(end.getMilliseconds() - 1);
                    buckets.push({
                        start: start.getTime(),
                        end: end.getTime(),
                        label: start.toLocaleDateString(locale, { month: 'short' }),
                    });
                }
                return buckets;
            }
            if (analyticsGranularity === 'quarter') {
                for (let i = 7; i >= 0; i -= 1) {
                    const base = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
                    const quarter = Math.floor(base.getMonth() / 3) + 1;
                    const start = new Date(base.getFullYear(), (quarter - 1) * 3, 1);
                    const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
                    end.setMilliseconds(end.getMilliseconds() - 1);
                    buckets.push({
                        start: start.getTime(),
                        end: end.getTime(),
                        label: `Q${quarter} ${String(start.getFullYear()).slice(-2)}`,
                    });
                }
                return buckets;
            }
            if (analyticsGranularity === 'year') {
                for (let i = 4; i >= 0; i -= 1) {
                    const start = new Date(now.getFullYear() - i, 0, 1);
                    const end = new Date(start.getFullYear() + 1, 0, 1);
                    end.setMilliseconds(end.getMilliseconds() - 1);
                    buckets.push({
                        start: start.getTime(),
                        end: end.getTime(),
                        label: String(start.getFullYear()),
                    });
                }
                return buckets;
            }

            // default: day
            for (let i = 6; i >= 0; i -= 1) {
                const start = new Date(now);
                start.setDate(now.getDate() - i);
                start.setHours(0, 0, 0, 0);
                const end = new Date(start);
                end.setDate(start.getDate() + 1);
                end.setMilliseconds(end.getMilliseconds() - 1);
                buckets.push({
                    start: start.getTime(),
                    end: end.getTime(),
                    label: start.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
                });
            }
            return buckets;
        };

        const buckets = buildBuckets();
        const ordersSeries = Array(buckets.length).fill(0);
        const completedSeries = Array(buckets.length).fill(0);
        const revenueSeries = Array(buckets.length).fill(0);
        const commissionSeries = Array(buckets.length).fill(0);

        const findBucketIndex = (timestamp) => buckets.findIndex(bucket => timestamp >= bucket.start && timestamp <= bucket.end);

        analyticsOrders.forEach(order => {
            const stamp = order.created_at || order.updated_at;
            if (stamp) {
                const ts = new Date(stamp).getTime();
                const idx = findBucketIndex(ts);
                if (idx >= 0) ordersSeries[idx] += 1;
            }
            if (COMPLETED_STATUSES.has(normalizeStatus(order.status))) {
                const completedStamp = order.completed_at || order.confirmed_at || order.updated_at || order.created_at;
                if (!completedStamp) return;
                const ts = new Date(completedStamp).getTime();
                const idx = findBucketIndex(ts);
                if (idx >= 0) {
                    completedSeries[idx] += 1;
                    const price = Number(order.final_price ?? order.initial_price ?? 0);
                    if (Number.isFinite(price)) {
                        revenueSeries[idx] += price;
                        if (normalizeStatus(order.status) === 'confirmed') {
                            commissionSeries[idx] += price * commissionRate;
                        }
                    }
                }
            }
        });

        return {
            labels: buckets.map(bucket => bucket.label),
            ordersSeries,
            completedSeries,
            revenueSeries,
            commissionSeries,
        };
    }, [analyticsOrders, analyticsGranularity, settings, language]);

    const analyticsPeople = useMemo(() => {
        const map = {};
        (masters || []).forEach(master => {
            const masterId = master?.id;
            if (!masterId) return;
            const key = String(masterId);
            if (map[key]) return;
            map[key] = {
                id: masterId,
                name: master.full_name || master.name || master.phone || master.email || `Master ${key.slice(0, 6)}`,
                completed: 0,
                revenue: 0,
            };
        });
        analyticsOrders.forEach(order => {
            const masterId = order.master?.id || order.master_id;
            if (!masterId) return;
            const key = String(masterId);
            if (!map[key]) {
                map[key] = {
                    id: masterId,
                    name: order.master?.full_name || order.master_name || `Master ${masterId}`,
                    completed: 0,
                    revenue: 0,
                };
            }
            const entry = map[key];
            if (COMPLETED_STATUSES.has(normalizeStatus(order.status))) {
                entry.completed += 1;
                const price = Number(order.final_price ?? order.initial_price ?? 0);
                if (Number.isFinite(price)) entry.revenue += price;
            }
        });
        const list = Object.values(map);
        const byCompleted = [...list].sort((a, b) => b.completed - a.completed || String(a.name).localeCompare(String(b.name)));
        const byRevenue = [...list].sort((a, b) => b.revenue - a.revenue || String(a.name).localeCompare(String(b.name)));

        const buildList = (items, valueKey, formatter) => {
            const max = Math.max(...items.map(item => item[valueKey] || 0), 1);
            return items.slice(0, 5).map(item => ({
                label: item.name,
                value: formatter(item),
                ratio: (item[valueKey] || 0) / max,
            }));
        };

        return {
            topByCompleted: buildList(byCompleted, 'completed', item => `${item.completed} ${TRANSLATIONS.analyticsJobs || 'jobs'}`),
            topByRevenue: buildList(byRevenue, 'revenue', item => `${formatMoney(item.revenue)} ${TRANSLATIONS.currency || 'som'}`),
        };
    }, [analyticsOrders, masters, TRANSLATIONS]);

    const analyticsDispatchers = useMemo(() => {
        const map = {};
        const roleLabel = (role) => {
            if (role === 'admin') {
                return TRANSLATIONS.adminRole || TRANSLATIONS.admin || 'Admin';
            }
            if (role === 'dispatcher') {
                return TRANSLATIONS.dispatcherRole || TRANSLATIONS.analyticsDispatcher || 'Dispatcher';
            }
            return '';
        };
        const seedDispatcher = (person, fallbackRole) => {
            const id = person?.id;
            if (!id) return;
            const key = String(id);
            if (map[key]) return;
            const role = person?.role || fallbackRole;
            const name = person?.full_name || person?.name || person?.phone || person?.email || `Dispatcher ${key.slice(0, 6)}`;
            const suffix = roleLabel(role);
            map[key] = {
                id,
                name: suffix ? `${name} (${suffix})` : name,
                orders: 0,
                revenue: 0,
            };
        };

        (dispatchers || []).forEach(d => seedDispatcher(d, 'dispatcher'));
        (adminUsers || []).forEach(a => seedDispatcher(a, 'admin'));

        analyticsOrders.forEach(order => {
            const handlerId = order.assigned_dispatcher_id || order.dispatcher_id;
            if (!handlerId) return;
            const key = String(handlerId);
            if (!map[key]) {
                map[key] = {
                    id: handlerId,
                    name: order.assigned_dispatcher?.full_name || order.dispatcher?.full_name || `Dispatcher ${String(handlerId).slice(0, 6)}`,
                    orders: 0,
                    revenue: 0,
                };
            }
            const entry = map[key];
            entry.orders += 1;
            if (COMPLETED_STATUSES.has(normalizeStatus(order.status))) {
                const price = Number(order.final_price ?? order.initial_price ?? 0);
                if (Number.isFinite(price)) entry.revenue += price;
            }
        });
        const list = Object.values(map);
        const byOrders = [...list].sort((a, b) => b.orders - a.orders || String(a.name).localeCompare(String(b.name)));
        const byRevenue = [...list].sort((a, b) => b.revenue - a.revenue || String(a.name).localeCompare(String(b.name)));

        const buildList = (items, valueKey, formatter) => {
            const max = Math.max(...items.map(item => item[valueKey] || 0), 1);
            return items.slice(0, 5).map(item => ({
                label: item.name,
                value: formatter(item),
                ratio: (item[valueKey] || 0) / max,
            }));
        };

        return {
            topByOrders: buildList(byOrders, 'orders', item => `${formatNumber(item.orders)} ${TRANSLATIONS.analyticsOrders || TRANSLATIONS.orders || 'orders'}`),
            topByRevenue: buildList(byRevenue, 'revenue', item => `${formatMoney(item.revenue)} ${TRANSLATIONS.currency || 'som'}`),
        };
    }, [analyticsOrders, dispatchers, adminUsers, TRANSLATIONS, language]);

    const dispatcherStatusBreakdown = useMemo(() => {
        const counts = { open: 0, active: 0, completed: 0, canceled: 0 };
        dispatcherFilteredOrders.forEach(order => {
            const status = normalizeStatus(order.status);
            if (CANCELED_STATUSES.has(status)) {
                counts.canceled += 1;
                return;
            }
            if (COMPLETED_STATUSES.has(status)) {
                counts.completed += 1;
                return;
            }
            if (['claimed', 'started', 'wip'].includes(status)) {
                counts.active += 1;
                return;
            }
            counts.open += 1;
        });
        return counts;
    }, [dispatcherFilteredOrders]);

    const masterStatusBreakdown = useMemo(() => {
        const counts = { open: 0, active: 0, completed: 0, canceled: 0 };
        masterFilteredOrders.forEach(order => {
            const status = normalizeStatus(order.status);
            if (CANCELED_STATUSES.has(status)) {
                counts.canceled += 1;
                return;
            }
            if (COMPLETED_STATUSES.has(status)) {
                counts.completed += 1;
                return;
            }
            if (['claimed', 'started', 'wip'].includes(status)) {
                counts.active += 1;
                return;
            }
            counts.open += 1;
        });
        return counts;
    }, [masterFilteredOrders]);

    const analyticsDispatcherStats = useMemo(() => {
        const targetId = analyticsDispatcherId;
        const commissionRate = Number(settings?.commission_rate) || 0;
        const stats = {
            totalOrders: 0,
            createdOrders: 0,
            handledOrders: 0,
            canceledOrders: 0,
            transferredOrders: 0,
            totalAmount: 0,
            commissionCollected: 0,
        };

        if (!dispatcherFilteredOrders?.length) return stats;

        dispatcherFilteredOrders.forEach(order => {
            const createdId = order.dispatcher_id ? String(order.dispatcher_id) : null;
            const assignedId = order.assigned_dispatcher_id ? String(order.assigned_dispatcher_id) : createdId;
            const target = String(targetId);

            stats.totalOrders += 1;

            if (createdId && (targetId === 'all' || createdId === target)) {
                stats.createdOrders += 1;
            }

            if (assignedId && (targetId === 'all' || assignedId === target)) {
                stats.handledOrders += 1;
            }

            const normalized = normalizeStatus(order.status);
            if (CANCELED_STATUSES.has(normalized) && (targetId === 'all' || assignedId === target)) {
                stats.canceledOrders += 1;
            }

            const isTransferred = createdId && assignedId && createdId !== assignedId;
            if (isTransferred && (targetId === 'all' || createdId === target || assignedId === target)) {
                stats.transferredOrders += 1;
            }

            if (COMPLETED_STATUSES.has(normalized) && (targetId === 'all' || assignedId === target)) {
                const price = Number(order.final_price ?? order.initial_price ?? order.callout_fee ?? 0);
                if (Number.isFinite(price)) {
                    stats.totalAmount += price;
                    const commissionAmount = Number(order.commission_amount);
                    if (Number.isFinite(commissionAmount) && commissionAmount > 0) {
                        stats.commissionCollected += commissionAmount;
                    } else {
                        stats.commissionCollected += price * commissionRate;
                    }
                }
            }
        });

        return stats;
    }, [dispatcherFilteredOrders, analyticsDispatcherId, settings]);

    const analyticsMasterStats = useMemo(() => {
        const stats = {
            totalOrders: 0,
            activeJobs: 0,
            completedOrders: 0,
            canceledOrders: 0,
            totalAmount: 0,
            avgOrderValue: 0,
        };

        if (!masterFilteredOrders?.length) return stats;

        masterFilteredOrders.forEach(order => {
            const status = normalizeStatus(order.status);
            stats.totalOrders += 1;
            if (CANCELED_STATUSES.has(status)) {
                stats.canceledOrders += 1;
            } else if (COMPLETED_STATUSES.has(status)) {
                stats.completedOrders += 1;
                const price = Number(order.final_price ?? order.initial_price ?? order.callout_fee ?? 0);
                if (Number.isFinite(price)) stats.totalAmount += price;
            } else if (['claimed', 'started', 'wip'].includes(status)) {
                stats.activeJobs += 1;
            }
        });

        stats.avgOrderValue = stats.completedOrders ? stats.totalAmount / stats.completedOrders : 0;
        return stats;
    }, [masterFilteredOrders]);

    const getTrendWindow = useCallback((rangeKey) => {
        const days = rangeKey === 'month' ? 30 : 7;
        const anchor = analyticsRangeWindow?.end ? new Date(analyticsRangeWindow.end) : new Date();
        const end = new Date(anchor);
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(start.getDate() - (days - 1));
        start.setHours(0, 0, 0, 0);
        return { days, start, end };
    }, [analyticsRangeWindow]);

    const derivedTrendRange = useMemo(() => {
        if (analyticsRange === 'today' || analyticsRange === '7d') return 'week';
        if (analyticsRange === 'custom') {
            const start = analyticsCustomRange?.start;
            const end = analyticsCustomRange?.end;
            if (start && end) {
                const diffDays = Math.max(1, Math.ceil((end - start) / DAY_MS));
                return diffDays <= 14 ? 'week' : 'month';
            }
            return 'month';
        }
        return 'month';
    }, [analyticsRange, analyticsCustomRange]);

    const dispatcherTrendWindow = useMemo(() => getTrendWindow(derivedTrendRange), [getTrendWindow, derivedTrendRange]);
    const masterTrendWindow = useMemo(() => getTrendWindow(derivedTrendRange), [getTrendWindow, derivedTrendRange]);

    const buildTrendSeries = useCallback((ordersList, startDate, days, dateGetter, valueGetter) => {
        const series = new Array(days).fill(0);
        if (!ordersList?.length || !startDate) return series;
        ordersList.forEach(order => {
            const stamp = dateGetter ? dateGetter(order) : null;
            if (!stamp) return;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return;
            const index = Math.floor((ts.getTime() - startDate.getTime()) / DAY_MS);
            if (index < 0 || index >= days) return;
            const addValue = valueGetter ? valueGetter(order) : 1;
            if (!Number.isFinite(addValue)) return;
            series[index] += addValue;
        });
        return series;
    }, []);

    const getSeriesMeta = useCallback((series = []) => {
        if (!series.length) return { max: 0, avg: 0, activeDays: 0 };
        const max = Math.max(...series, 0);
        const total = series.reduce((sum, val) => sum + (Number.isFinite(val) ? val : 0), 0);
        const avg = series.length ? total / series.length : 0;
        const activeDays = series.filter(val => val > 0).length;
        return { max, avg, activeDays };
    }, []);

    const dispatcherCreatedOrdersForTrend = useMemo(() => {
        return dispatcherFilteredOrders.filter(order => {
            const createdId = order.dispatcher_id ? String(order.dispatcher_id) : null;
            if (!createdId) return false;
            if (analyticsDispatcherId === 'all') return true;
            return createdId === String(analyticsDispatcherId);
        });
    }, [dispatcherFilteredOrders, analyticsDispatcherId]);

    const dispatcherHandledOrdersForTrend = useMemo(() => {
        return dispatcherFilteredOrders.filter(order => {
            const assignedId = order.assigned_dispatcher_id ? String(order.assigned_dispatcher_id) : (order.dispatcher_id ? String(order.dispatcher_id) : null);
            if (!assignedId) return false;
            if (analyticsDispatcherId === 'all') return true;
            return assignedId === String(analyticsDispatcherId);
        });
    }, [dispatcherFilteredOrders, analyticsDispatcherId]);

    const dispatcherCreatedSeries = useMemo(
        () => buildTrendSeries(dispatcherCreatedOrdersForTrend, dispatcherTrendWindow.start, dispatcherTrendWindow.days, o => o.created_at),
        [buildTrendSeries, dispatcherCreatedOrdersForTrend, dispatcherTrendWindow]
    );

    const dispatcherHandledSeries = useMemo(
        () => buildTrendSeries(dispatcherHandledOrdersForTrend, dispatcherTrendWindow.start, dispatcherTrendWindow.days, o => o.updated_at || o.created_at),
        [buildTrendSeries, dispatcherHandledOrdersForTrend, dispatcherTrendWindow]
    );

    const dispatcherCreatedMeta = useMemo(() => getSeriesMeta(dispatcherCreatedSeries), [getSeriesMeta, dispatcherCreatedSeries]);
    const dispatcherHandledMeta = useMemo(() => getSeriesMeta(dispatcherHandledSeries), [getSeriesMeta, dispatcherHandledSeries]);

    const masterCompletedOrdersForTrend = useMemo(() => {
        return masterFilteredOrders.filter(order => COMPLETED_STATUSES.has(normalizeStatus(order.status)));
    }, [masterFilteredOrders]);

    const masterRevenueOrdersForTrend = useMemo(() => {
        return masterFilteredOrders.filter(order => COMPLETED_STATUSES.has(normalizeStatus(order.status)));
    }, [masterFilteredOrders]);

    const masterCompletedSeries = useMemo(
        () => buildTrendSeries(masterCompletedOrdersForTrend, masterTrendWindow.start, masterTrendWindow.days, o => o.completed_at || o.confirmed_at || o.updated_at || o.created_at),
        [buildTrendSeries, masterCompletedOrdersForTrend, masterTrendWindow]
    );

    const masterRevenueSeries = useMemo(
        () => buildTrendSeries(
            masterRevenueOrdersForTrend,
            masterTrendWindow.start,
            masterTrendWindow.days,
            o => o.completed_at || o.confirmed_at || o.updated_at || o.created_at,
            o => Number(o.final_price ?? o.initial_price ?? o.callout_fee ?? 0)
        ),
        [buildTrendSeries, masterRevenueOrdersForTrend, masterTrendWindow]
    );

    const masterCompletedMeta = useMemo(() => getSeriesMeta(masterCompletedSeries), [getSeriesMeta, masterCompletedSeries]);
    const masterRevenueMeta = useMemo(() => getSeriesMeta(masterRevenueSeries), [getSeriesMeta, masterRevenueSeries]);

    const priceDistData = useMemo(() => {
        const now = new Date();
        let rangeStart = null;
        let rangeEnd = new Date(now);
        rangeEnd.setHours(23, 59, 59, 999);

        if (priceDistRange !== 'all') {
            if (priceDistRange === '7d') {
                rangeStart = new Date(now.getTime() - 6 * DAY_MS);
            } else if (priceDistRange === '30d') {
                rangeStart = new Date(now.getTime() - 29 * DAY_MS);
            } else if (priceDistRange === '90d') {
                rangeStart = new Date(now.getTime() - 89 * DAY_MS);
            } else if (priceDistRange === 'ytd') {
                rangeStart = new Date(now.getFullYear(), 0, 1);
            }
        }

        if (rangeStart) {
            rangeStart.setHours(0, 0, 0, 0);
        }

        const scopeOrders = priceDistScope === 'completed'
            ? analyticsFilteredOrders.filter(o => COMPLETED_STATUSES.has(normalizeStatus(o.status)))
            : analyticsFilteredOrders;

        const getOrderStamp = (order) => {
            if (priceDistScope === 'completed') {
                return order.completed_at || order.confirmed_at || order.updated_at || order.created_at;
            }
            return order.created_at || order.updated_at;
        };

        const eligibleOrders = scopeOrders.filter(order => {
            const stamp = getOrderStamp(order);
            if (!stamp) return false;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return false;
            if (rangeStart && ts < rangeStart) return false;
            if (ts > rangeEnd) return false;
            return true;
        });

        if (priceDistRange === 'all' && eligibleOrders.length > 0) {
            const stamps = eligibleOrders
                .map(o => new Date(getOrderStamp(o)))
                .filter(d => !Number.isNaN(d.getTime()));
            if (stamps.length) {
                rangeStart = new Date(Math.min(...stamps.map(d => d.getTime())));
                rangeStart.setHours(0, 0, 0, 0);
                rangeEnd = new Date(Math.max(...stamps.map(d => d.getTime())));
                rangeEnd.setHours(23, 59, 59, 999);
            }
        }

        if (!rangeStart) {
            rangeStart = new Date(now.getTime() - 29 * DAY_MS);
            rangeStart.setHours(0, 0, 0, 0);
        }

        const startOfWeek = (date) => {
            const d = new Date(date);
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const getBucketStart = (date) => {
            const d = new Date(date);
            if (priceDistGrouping === 'day') {
                d.setHours(0, 0, 0, 0);
                return d;
            }
            if (priceDistGrouping === 'week') {
                return startOfWeek(d);
            }
            return new Date(d.getFullYear(), d.getMonth(), 1);
        };

        const formatBucketLabel = (date) => {
            if (priceDistGrouping === 'month') {
                if (priceDistRange === 'all') {
                    return date.toLocaleDateString(analyticsLocale, { month: 'short', year: '2-digit' });
                }
                return date.toLocaleDateString(analyticsLocale, { month: 'short' });
            }
            if (priceDistGrouping === 'day' && priceDistRange === '7d') {
                return date.toLocaleDateString(analyticsLocale, { day: 'numeric' });
            }
            return date.toLocaleDateString(analyticsLocale, { month: 'short', day: 'numeric' });
        };

        const bucketList = [];
        let cursor = new Date(getBucketStart(rangeStart));
        const endCursor = new Date(rangeEnd);

        while (cursor <= endCursor) {
            const start = new Date(cursor);
            let end = new Date(start);
            if (priceDistGrouping === 'day') {
                end.setDate(end.getDate() + 1);
            } else if (priceDistGrouping === 'week') {
                end.setDate(end.getDate() + 7);
            } else {
                end = new Date(end.getFullYear(), end.getMonth() + 1, 1);
            }
            end.setMilliseconds(end.getMilliseconds() - 1);

            const key = start.toISOString();
            bucketList.push({
                key,
                start,
                end,
                label: formatBucketLabel(start),
                orders: [],
            });

            cursor = new Date(end);
            cursor.setDate(cursor.getDate() + 1);
            cursor.setHours(0, 0, 0, 0);
        }

        const bucketMap = new Map(bucketList.map(bucket => [bucket.key, bucket]));
        const allValues = [];

        eligibleOrders.forEach(order => {
            const stamp = getOrderStamp(order);
            if (!stamp) return;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return;
            const bucketStart = getBucketStart(ts);
            const key = bucketStart.toISOString();
            const bucket = bucketMap.get(key);
            if (!bucket) return;
            bucket.orders.push(order);
        });

        const buckets = bucketList.map(bucket => {
            const values = bucket.orders
                .map(order => Number(order.final_price ?? order.initial_price ?? order.callout_fee ?? 0))
                .filter(val => Number.isFinite(val) && val > 0);
            values.forEach(val => allValues.push(val));
            const stats = calcStats(values);
            return {
                ...bucket,
                values,
                stats,
                smallSample: stats.n > 0 && stats.n < 5,
            };
        });

        const summary = calcStats(allValues);
        return {
            buckets,
            summary,
            rangeStart,
            rangeEnd,
            totalOrders: allValues.length,
        };
    }, [analyticsFilteredOrders, priceDistRange, priceDistGrouping, priceDistScope, analyticsLocale]);

    const priceDistGroupingRules = useMemo(() => ({
        '7d': ['day'],
        '30d': ['day', 'week'],
        '90d': ['week'],
        ytd: ['week', 'month'],
        all: ['month'],
    }), []);

    useEffect(() => {
        const allowed = priceDistGroupingRules[priceDistRange] || ['week'];
        if (!allowed.includes(priceDistGrouping)) {
            const next = allowed[0];
            setPriceDistGrouping(next);
            setPriceDistGroupingNotice(TRANSLATIONS.analyticsPriceDistributionAutoAdjusted || 'Grouping adjusted to match range.');
        } else {
            setPriceDistGroupingNotice(null);
        }
    }, [priceDistRange, priceDistGrouping, priceDistGroupingRules, TRANSLATIONS.analyticsPriceDistributionAutoAdjusted]);

    useEffect(() => {
        if (activeTab !== 'analytics') return;
        setAnalyticsUpdatedAt(new Date());
    }, [analyticsOrders.length, analyticsRange, analyticsFilters, analyticsGranularity, activeTab]);

    useEffect(() => {
        if (loading || activeTab !== 'analytics' || !loadedTabsRef.current.has('analytics')) return;
        loadCommissionData();
        loadBalanceTopUpStats();
    }, [analyticsRangeWindow, loading, activeTab]);

    useEffect(() => {
        if (analyticsSection === 'quality') {
            setAnalyticsSection('overview');
        }
    }, [analyticsSection]);

    const fallbackNeedsActionOrders = useMemo(() => {
        const now = Date.now();
        return orders.filter(o => {
            if (o.is_disputed) return false;
            if (o.status === ORDER_STATUS.COMPLETED) return true;
            if (o.status === ORDER_STATUS.CANCELED_BY_CLIENT) return false;
            if (o.status === ORDER_STATUS.CANCELED_BY_MASTER) return true;
            if (o.status === ORDER_STATUS.PLACED && (now - new Date(o.created_at).getTime()) > 15 * 60000) return true;
            if (o.status === ORDER_STATUS.CLAIMED && (now - new Date(o.updated_at).getTime()) > 30 * 60000) return true;
            return false;
        });
    }, [orders]);

    const fallbackStatusCounts = useMemo(() => {
        const counts = { Active: 0, Payment: 0, Confirmed: 0, Canceled: 0 };
        orders.forEach(o => {
            if (o?.is_disputed) return;
            if ([ORDER_STATUS.PLACED, ORDER_STATUS.REOPENED, ORDER_STATUS.CLAIMED, ORDER_STATUS.STARTED].includes(o.status)) {
                counts.Active += 1;
            } else if (o.status === ORDER_STATUS.COMPLETED) {
                counts.Payment += 1;
            } else if (o.status === ORDER_STATUS.CONFIRMED) {
                counts.Confirmed += 1;
            } else if (o.status?.includes('canceled')) {
                counts.Canceled += 1;
            }
        });
        return counts;
    }, [orders]);

    const needsActionOrders = queueAttentionItemsState?.length ? queueAttentionItemsState : fallbackNeedsActionOrders;
    const needsActionCount = Number.isFinite(queueAttentionCountState) && queueAttentionCountState > 0
        ? queueAttentionCountState
        : needsActionOrders.length;
    const statusCounts = queueStatusCountsState || fallbackStatusCounts;
    const filteredOrders = queueOrders;
    const filterCountSource = orders.length > 0 ? orders : queueOrders;

    const queueSearchNeedle = useMemo(() => String(queueSearchDebounced || '').trim().toLowerCase(), [queueSearchDebounced]);
    const queueSearchDigits = useMemo(() => String(queueSearchDebounced || '').replace(/\D/g, ''), [queueSearchDebounced]);

    const matchesStatusScope = useCallback((order, targetStatus) => {
        const normalized = normalizeStatus(order?.status);
        if (targetStatus === 'Active') return ['placed', 'reopened', 'claimed', 'started'].includes(normalized);
        if (targetStatus === 'Payment') return normalized === 'completed';
        if (targetStatus === 'Confirmed') return normalized === 'confirmed';
        if (targetStatus === 'Canceled') return String(normalized).includes('canceled');
        return true;
    }, []);

    const matchesQueueSearch = useCallback((order, needle, digitsNeedle) => {
        if (!needle) return true;
        const idText = String(order?.id || '').toLowerCase();
        const addressText = String(order?.full_address || '').toLowerCase();
        const clientNameText = String(order?.client?.full_name || '').toLowerCase();
        if (idText.includes(needle) || addressText.includes(needle) || clientNameText.includes(needle)) {
            return true;
        }
        if (digitsNeedle) {
            const clientPhoneDigits = String(order?.client?.phone || '').replace(/\D/g, '');
            return clientPhoneDigits.includes(digitsNeedle);
        }
        return false;
    }, []);

    const queueFilterOptionCounts = useMemo(() => {
        const countFor = ({ status = statusFilter, dispatcher = filterDispatcher, urgency = filterUrgency, service = serviceFilter }) => {
            return filterCountSource.filter(order => {
                if (!order) return false;
                if (order.is_disputed) return false;
                if (!matchesStatusScope(order, status)) return false;
                if (!matchesQueueSearch(order, queueSearchNeedle, queueSearchDigits)) return false;

                if (dispatcher === 'unassigned') {
                    const hasAnyDispatcher = !!(order.dispatcher_id || order.assigned_dispatcher_id || order.dispatcher?.id || order.assigned_dispatcher?.id);
                    if (hasAnyDispatcher) return false;
                } else if (dispatcher !== 'all') {
                    const target = String(dispatcher);
                    const createdId = order.dispatcher_id ? String(order.dispatcher_id) : (order.dispatcher?.id ? String(order.dispatcher?.id) : null);
                    const assignedId = order.assigned_dispatcher_id ? String(order.assigned_dispatcher_id) : (order.assigned_dispatcher?.id ? String(order.assigned_dispatcher?.id) : null);
                    if (createdId !== target && assignedId !== target) return false;
                }

                if (urgency !== 'all' && String(order.urgency || '') !== String(urgency)) return false;
                if (service !== 'all' && String(order.service_type || '') !== String(service)) return false;
                return true;
            }).length;
        };

        const status = {};
        STATUS_OPTIONS.forEach(opt => { status[opt.id] = countFor({ status: opt.id }); });

        const dispatcher = {};
        dispatcherFilterOptions.forEach(opt => { dispatcher[opt.id] = countFor({ dispatcher: opt.id }); });

        const urgency = {};
        URGENCY_OPTIONS.forEach(opt => { urgency[opt.id] = countFor({ urgency: opt.id }); });

        const service = {};
        serviceFilterOptions.forEach(opt => { service[opt.id] = countFor({ service: opt.id }); });

        return { status, dispatcher, urgency, service };
    }, [
        filterCountSource,
        statusFilter,
        filterDispatcher,
        filterUrgency,
        serviceFilter,
        queueSearchNeedle,
        queueSearchDigits,
        matchesStatusScope,
        matchesQueueSearch,
        dispatcherFilterOptions,
        serviceFilterOptions,
    ]);

    // Reset pagination when filters change
    useEffect(() => {
        setQueuePage(1);
    }, [queueSearchDebounced, statusFilter, filterUrgency, serviceFilter, filterSort, filterDispatcher, viewMode]);

    useEffect(() => {
        if (serviceTypeModal.visible) {
            const base = { code: '', name_en: '', name_ru: '', name_kg: '', sort_order: 99, is_active: true };
            setTempServiceType(serviceTypeModal.type ? { ...base, ...serviceTypeModal.type } : base);
        }
    }, [serviceTypeModal]);

    useEffect(() => {
        if (districtModal.visible) {
            setTempDistrict(districtModal.district ? { ...districtModal.district } : { code: '', name_en: '', name_ru: '', name_kg: '', region: 'bishkek', sort_order: 99, is_active: true });
        }
    }, [districtModal]);

    useEffect(() => {
        if (cancellationReasonModal.visible) {
            const base = {
                code: '',
                name_en: '',
                name_ru: '',
                name_kg: '',
                applicable_to: 'both',
                sort_order: 0,
                is_active: true,
            };
            setTempCancellationReason(
                cancellationReasonModal.reason
                    ? { ...base, ...cancellationReasonModal.reason }
                    : base
            );
        }
    }, [cancellationReasonModal]);

    // --- Ported State ---
    const [detailsOrder, setDetailsOrder] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [newOrder, setNewOrder] = useState(INITIAL_ORDER_STATE);
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState(null);
    const [phoneError, setPhoneError] = useState('');
    const [showRecentAddr, setShowRecentAddr] = useState(false); // For autocomplete if needed
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const loadedTabsRef = useRef(new Set());
    const tabDirtyRef = useRef(ADMIN_TAB_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    const tabLastLoadedAtRef = useRef({});
    const tabLoadSeqRef = useRef(ADMIN_TAB_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {}));
    const tabLoadInFlightRef = useRef(new Map());
    const pendingCreatedOrdersRef = useRef(new Map());
    const createConfirmInFlightRef = useRef(new Map());
    const ordersFullLoadSeqRef = useRef(0);
    const pickerSearchSeqRef = useRef(0);
    const assignMasterSearchSeqRef = useRef(0);
    const realtimeSyncTimerRef = useRef(null);
    const realtimeLastRunAtRef = useRef(0);
    const activeTabRef = useRef(activeTab);
    const queueLoadIdRef = useRef(0);
    const queueTimeoutToastAtRef = useRef(0);
    const loadAllDataSeqRef = useRef(0);
    const loadAllDataLatestRef = useRef(null);
    const loadAllOrdersLatestRef = useRef(null);
    const ensureTabDataLatestRef = useRef(null);
    const hadAuthUserRef = useRef(false);
    const [tabLoadingState, setTabLoadingState] = useState({
        analytics: false,
        orders: false,
        people: false,
        settings: false,
        create_order: false,
        disputes: false,
        payouts: false,
    });

    // Interactive Stats Modal
    const [statModalVisible, setStatModalVisible] = useState(false);
    const [statModalTitle, setStatModalTitle] = useState('');
    const [statFilteredOrders, setStatFilteredOrders] = useState([]);

    // --------------------
    const [actionLoading, setActionLoading] = useState(false);

    // NEW: State for additional modals
    const [showBalanceModal, setShowBalanceModal] = useState(false);
    const [balanceData, setBalanceData] = useState({ amount: '', type: 'top_up', notes: '' });
    const [isEditingMasterPerformance, setIsEditingMasterPerformance] = useState(false);
    const [masterPerformanceTarget, setMasterPerformanceTarget] = useState(null);
    const [masterPerformanceData, setMasterPerformanceData] = useState({
        max_active_jobs: '',
        max_immediate_orders: '',
        max_pending_confirmation: '',
    });
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [availableMasters, setAvailableMasters] = useState([]);
    const assignMastersBaseRef = useRef([]);
    const [assignMasterSearchQuery, setAssignMasterSearchQuery] = useState('');
    const assignMasterSearchDebounced = useDebouncedValue(assignMasterSearchQuery.trim(), 220);
    const [assignMasterSearchLoading, setAssignMasterSearchLoading] = useState(false);
    const [assignOrderId, setAssignOrderId] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentOrder, setPaymentOrder] = useState(null);
    const [paymentData, setPaymentData] = useState({ ...DEFAULT_PAYMENT_CONFIRMATION_DATA });
    const [showMasterDetails, setShowMasterDetails] = useState(false);
    const [masterDetails, setMasterDetails] = useState(null);
    const [masterDetailsLoading, setMasterDetailsLoading] = useState(false);
    const [masterBalanceHistory, setMasterBalanceHistory] = useState([]);
    const [masterBalanceHistoryLoading, setMasterBalanceHistoryLoading] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [detailsPerson, setDetailsPerson] = useState(null); // For person details drawer (master/dispatcher/partner)
    const [isEditingPerson, setIsEditingPerson] = useState(false);
    const [isPersonalInfoExpanded, setIsPersonalInfoExpanded] = useState(true);
    const [editPersonData, setEditPersonData] = useState({});
    const [partnerPayoutRequests, setPartnerPayoutRequests] = useState([]);
    const [partnerCommissionInput, setPartnerCommissionInput] = useState('');
    const [partnerMinPayoutInput, setPartnerMinPayoutInput] = useState('');
    const [partnerDeductAmount, setPartnerDeductAmount] = useState('');
    const [partnerDeductReason, setPartnerDeductReason] = useState('');
    const [isPartnerFinanceExpanded, setIsPartnerFinanceExpanded] = useState(true);
    const [isEditingPartnerTerms, setIsEditingPartnerTerms] = useState(false);
    const [isEditingPartnerBalance, setIsEditingPartnerBalance] = useState(false);
    const [partnerBalanceActionType, setPartnerBalanceActionType] = useState('top_up');
    const [partnerHistoryFilter, setPartnerHistoryFilter] = useState('all');
    const [partnerHistoryRequestsLimit, setPartnerHistoryRequestsLimit] = useState(PARTNER_HISTORY_PAGE_SIZE);
    const [partnerHistoryTransactionsLimit, setPartnerHistoryTransactionsLimit] = useState(PARTNER_HISTORY_PAGE_SIZE);
    const [showPartnerHistoryModal, setShowPartnerHistoryModal] = useState(false);
    const [partnerHistorySearchQuery, setPartnerHistorySearchQuery] = useState('');
    const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
    const [masterOrderHistory, setMasterOrderHistory] = useState([]);
    const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
    const orderHistoryCache = useRef(new Map());
    const [showTopUpHistoryModal, setShowTopUpHistoryModal] = useState(false);
    const [topUpHistory, setTopUpHistory] = useState([]);
    const [topUpHistoryLoading, setTopUpHistoryLoading] = useState(false);
    const topUpHistoryCache = useRef(new Map());
    const [partnerFinanceSummary, setPartnerFinanceSummary] = useState(createEmptyPartnerFinanceSummary);
    const [partnerFinanceLoading, setPartnerFinanceLoading] = useState(false);
    const partnerFinanceCache = useRef(new Map());

    // NEW: Add User Modal State
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [addUserRole, setAddUserRole] = useState('master'); // 'master' | 'dispatcher' | 'partner'
    const [newUserData, setNewUserData] = useState(createEmptyNewUserData);
    const [newUserPhoneError, setNewUserPhoneError] = useState('');
    const [editPersonPhoneError, setEditPersonPhoneError] = useState('');

    // Password Reset Modal State
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [passwordResetTarget, setPasswordResetTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        if (!detailsPerson?.id || detailsPerson?.type !== 'master') {
            setMasterBalanceHistory([]);
            setMasterBalanceHistoryLoading(false);
            return;
        }
        let isActive = true;
        setMasterBalanceHistoryLoading(true);
        earningsService.getBalanceTransactions(detailsPerson.id, 10)
            .then((history) => {
                if (!isActive) return;
                setMasterBalanceHistory(history || []);
            })
            .catch(() => {
                if (!isActive) return;
                setMasterBalanceHistory([]);
            })
            .finally(() => {
                if (!isActive) return;
                setMasterBalanceHistoryLoading(false);
            });
        return () => { isActive = false; };
    }, [detailsPerson?.id, detailsPerson?.type]);

    useEffect(() => {
        if (!detailsPerson?.id || detailsPerson?.type !== 'partner') {
            setPartnerPayoutRequests([]);
            setPartnerCommissionInput('');
            setPartnerMinPayoutInput('');
            setPartnerDeductAmount('');
            setPartnerDeductReason('');
            setIsPartnerFinanceExpanded(true);
            setIsEditingPartnerTerms(false);
            setIsEditingPartnerBalance(false);
            setPartnerBalanceActionType('top_up');
            setPartnerHistoryFilter('all');
            setPartnerHistoryRequestsLimit(PARTNER_HISTORY_PAGE_SIZE);
            setPartnerHistoryTransactionsLimit(PARTNER_HISTORY_PAGE_SIZE);
            setShowPartnerHistoryModal(false);
            setPartnerHistorySearchQuery('');
            return;
        }
        let isActive = true;
        const commissionPercent = Number(detailsPerson.partner_commission_rate || 0) * 100;
        setPartnerCommissionInput(Number.isFinite(commissionPercent) ? String(commissionPercent) : '10');
        setPartnerMinPayoutInput(String(detailsPerson.partner_min_payout ?? 50));
        setPartnerDeductAmount('');
        setPartnerDeductReason('');
        setIsPartnerFinanceExpanded(true);
        setIsEditingPartnerTerms(false);
        setIsEditingPartnerBalance(false);
        setPartnerBalanceActionType('top_up');
        setPartnerHistoryFilter('all');
        setPartnerHistoryRequestsLimit(PARTNER_HISTORY_PAGE_SIZE);
        setPartnerHistoryTransactionsLimit(PARTNER_HISTORY_PAGE_SIZE);
        setShowPartnerHistoryModal(false);
        setPartnerHistorySearchQuery('');
        partnerFinanceService.getPartnerPayoutRequestsAdmin({ partnerId: detailsPerson.id, limit: 100 })
            .then((requests) => {
                if (!isActive) return;
                setPartnerPayoutRequests(requests || []);
            })
            .catch(() => {
                if (!isActive) return;
                setPartnerPayoutRequests([]);
            });
        return () => { isActive = false; };
    }, [detailsPerson?.id, detailsPerson?.type]);

    useEffect(() => {
        setIsPersonalInfoExpanded(true);
    }, [detailsPerson?.id]);
    const [confirmPassword, setConfirmPassword] = useState('');

    const setTabLoading = useCallback((tabKey, isLoading) => {
        setTabLoadingState(prev => {
            if (prev[tabKey] === isLoading) return prev;
            return { ...prev, [tabKey]: isLoading };
        });
    }, []);
    const getTabStaleTtlMs = useCallback((tabKey) => {
        return ADMIN_TAB_STALE_TTL_MS[tabKey] || ADMIN_DEFAULT_TAB_STALE_TTL_MS;
    }, []);
    const markTabsDirty = useCallback((tabKeys, reason = 'manual') => {
        const keys = tabKeys === '*'
            ? ADMIN_TAB_KEYS
            : (Array.isArray(tabKeys) ? tabKeys : [tabKeys]).filter(Boolean);
        keys.forEach((key) => {
            tabDirtyRef.current[key] = true;
            loadedTabsRef.current.delete(key);
        });
        adminDiag('tabs_mark_dirty', { keys, reason });
    }, []);
    const shouldRefreshTab = useCallback((tabKey, { force = false, reason = 'auto' } = {}) => {
        if (!tabKey) return false;
        if (force) return true;
        if (!loadedTabsRef.current.has(tabKey)) return true;
        if (tabDirtyRef.current[tabKey]) return true;
        const ttlMs = getTabStaleTtlMs(tabKey);
        const lastLoadedAt = Number(tabLastLoadedAtRef.current?.[tabKey] || 0);
        if (!lastLoadedAt) return true;
        const stale = (Date.now() - lastLoadedAt) > ttlMs;
        if (stale) {
            adminDiag('tab_stale_refresh', { tabKey, ttlMs, ageMs: Date.now() - lastLoadedAt, reason });
        }
        return stale;
    }, [getTabStaleTtlMs]);

    // Initial Load
    useEffect(() => {
        loadAllData();
    }, []);
    useEffect(() => {
        if (!authUser?.id) {
            const hadAuthUser = hadAuthUserRef.current;
            hadAuthUserRef.current = false;
            authSyncUserIdRef.current = null;
            loadedTabsRef.current.clear();
            queueLoadIdRef.current += 1;
            if (hadAuthUser) {
                loadAllDataSeqRef.current += 1;
            }
            tabLoadInFlightRef.current.clear();
            tabLoadSeqRef.current = ADMIN_TAB_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
            tabLastLoadedAtRef.current = {};
            tabDirtyRef.current = ADMIN_TAB_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
            pendingCreatedOrdersRef.current.clear();
            createConfirmInFlightRef.current.clear();
            ordersFullLoadSeqRef.current = 0;
            realtimeLastRunAtRef.current = 0;
            if (realtimeSyncTimerRef.current) {
                clearTimeout(realtimeSyncTimerRef.current);
                realtimeSyncTimerRef.current = null;
            }
            setUser(null);
            setOrders([]);
            setQueueOrders([]);
            setQueueTotalCount(0);
            setQueueStatusCountsState(null);
            setQueueAttentionItemsState([]);
            setQueueAttentionCountState(0);
            setQueueLoading(false);
            setDisputes([]);
            setAdminPayoutRequests([]);
            setStats({});
            setCommissionStats({});
            setBalanceTopUpStats({ totalTopUps: 0, avgTopUp: 0, count: 0 });
            setPartners([]);
            setTabLoadingState({
                analytics: false,
                orders: false,
                people: false,
                settings: false,
                create_order: false,
                disputes: false,
                payouts: false,
            });
            return;
        }
        hadAuthUserRef.current = true;
        setUser(prev => {
            if (prev?.id === authUser.id) return { ...prev, ...authUser };
            return authUser;
        });
    }, [authUser]);

    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        setDistricts(prev => prev.map(d => ({
            ...d,
            label: (language === 'ru' ? d.name_ru : language === 'kg' ? d.name_kg : d.name_en) || d.name_en || d.label,
        })));
    }, [language]);

    // Reload Stats on Filter Change (without full loading screen)
    useEffect(() => {
        if (!loading && activeTab === 'analytics') {
            Promise.all([
                loadStats(),
                loadCommissionData()
            ]);
        }
    }, [dashboardFilter, loading, activeTab]);

    useEffect(() => {
        if (!loading && activeTab) {
            ensureTabData(activeTab, { force: true, reason: 'tab_enter' });
        }
    }, [activeTab, loading]);

    useEffect(() => {
        if (activeTab !== 'analytics') return undefined;
        const interval = setInterval(() => {
            setAnalyticsNowTick(Date.now());
        }, 60000);
        return () => clearInterval(interval);
    }, [activeTab]);

    useEffect(() => {
        if (loading || activeTab !== 'orders') return;
        loadOrdersQueue(queuePage);
    }, [
        loading,
        activeTab,
        queuePage,
        queueSearchDebounced,
        statusFilter,
        filterDispatcher,
        filterUrgency,
        serviceFilter,
        filterSort,
        viewMode
    ]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil((queueTotalCount || 0) / queuePageSize));
        if (queuePage > totalPages) {
            adminDiag('queue_page_clamped', { from: queuePage, to: totalPages, queueTotalCount, queuePageSize });
            setQueuePage(totalPages);
        }
    }, [queuePage, queuePageSize, queueTotalCount]);

    useEffect(() => {
        if (!loading) return undefined;
        const timeout = setTimeout(() => {
            setLoading(false);
            showToast?.(TRANSLATIONS.authRequestTimedOut || 'Loading timed out. You can retry with refresh.', 'warning');
        }, ADMIN_LOADING_HARD_TIMEOUT_MS);
        return () => clearTimeout(timeout);
    }, [loading, showToast, TRANSLATIONS.authRequestTimedOut]);

    useEffect(() => {
        if (settings?.default_guaranteed_payout && !newOrder.calloutFee) {
            setNewOrder(prev => ({ ...prev, calloutFee: String(settings.default_guaranteed_payout) }));
        }
    }, [settings]);

    useEffect(() => {
        const anyOverlayOpen = !!detailsOrder
            || !!detailsPerson
            || pickerModal.visible
            || showAssignModal
            || showBalanceModal
            || showDepositModal
            || showAddUserModal
            || showPasswordResetModal
            || showOrderHistoryModal
            || showTopUpHistoryModal
            || showPartnerHistoryModal
            || showPaymentModal
            || showMasterDetails
            || serviceTypeModal.visible
            || districtModal.visible
            || cancellationReasonModal.visible;
        if (anyOverlayOpen && isSidebarOpen) {
            setIsSidebarOpen(false);
        }
    }, [
        detailsOrder,
        detailsPerson,
        pickerModal.visible,
        showAssignModal,
        showBalanceModal,
        showDepositModal,
        showAddUserModal,
        showPasswordResetModal,
        showOrderHistoryModal,
        showTopUpHistoryModal,
        showPartnerHistoryModal,
        showPaymentModal,
        showMasterDetails,
        serviceTypeModal.visible,
        districtModal.visible,
        cancellationReasonModal.visible,
        isSidebarOpen
    ]);

    useEffect(() => {
        if (!detailsOrder) {
            setIsEditing(false);
        }
    }, [detailsOrder]);

    const loadCurrentUser = useCallback(async () => {
        try {
            let currentUser = await authService.getCurrentUser({ retries: 1, retryDelayMs: 350 });
            if (!currentUser) {
                await new Promise((resolve) => setTimeout(resolve, 450));
                currentUser = await authService.getCurrentUser({ retries: 1, retryDelayMs: 350 });
            }
            if (currentUser) {
                setUser(currentUser);
                return currentUser;
            } else if (authUser) {
                setUser(authUser);
                return authUser;
            } else {
                setUser(null);
                return null;
            }
        } catch (e) {
            console.error('Failed to load current user', e);
            setUser(null);
            return null;
        }
    }, [authUser]);

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
            const dateFilter = analyticsRangeWindow
                ? { type: 'custom', start: analyticsRangeWindow.start, end: analyticsRangeWindow.end }
                : { type: 'all' };
            const data = await earningsService.getCommissionStats(dateFilter);
            setCommissionStats(data || {});
        } catch (e) {
            console.error('Commission error', e);
        }
    };

    const loadBalanceTopUpStats = async () => {
        try {
            const start = analyticsRangeWindow?.start || null;
            const end = analyticsRangeWindow?.end || null;
            const data = await earningsService.getBalanceTopUpStats(start, end);
            setBalanceTopUpStats(data || { totalTopUps: 0, avgTopUp: 0, count: 0 });
        } catch (e) {
            console.error('Balance top-up stats error', e);
        }
    };

    const mergePendingCreatedOrders = useCallback((ordersList = []) => {
        const base = Array.isArray(ordersList) ? [...ordersList] : [];
        const now = Date.now();
        const pending = pendingCreatedOrdersRef.current;
        if (!pending.size) return base;

        const byId = new Map(base.map((order) => [String(order?.id || ''), order]));
        for (const [orderId, payload] of pending.entries()) {
            const ageMs = now - Number(payload?.createdAt || 0);
            if (ageMs > ADMIN_PENDING_CREATED_ORDER_TTL_MS) {
                pending.delete(orderId);
                continue;
            }
            if (byId.has(orderId)) {
                pending.delete(orderId);
                continue;
            }
            if (payload?.order) {
                base.unshift(payload.order);
                byId.set(orderId, payload.order);
            }
        }

        base.sort((a, b) => {
            const aTs = new Date(a?.created_at || 0).getTime();
            const bTs = new Date(b?.created_at || 0).getTime();
            return bTs - aTs;
        });
        return base;
    }, []);

    const loadAllOrders = useCallback(async ({ reason = 'unspecified' } = {}) => {
        const loadId = ordersFullLoadSeqRef.current + 1;
        ordersFullLoadSeqRef.current = loadId;
        const startedAt = Date.now();
        adminDiag('orders_full_load_start', { loadId, reason });
        const data = await ordersService.getAllOrders();
        const merged = mergePendingCreatedOrders(data || []);
        if (ordersFullLoadSeqRef.current !== loadId) {
            adminDiag('orders_full_load_stale_ignored', { loadId, reason, count: merged.length });
            return null;
        }
        setOrders(merged);
        adminDiag('orders_full_load_done', {
            loadId,
            reason,
            count: merged.length,
            pendingCount: pendingCreatedOrdersRef.current.size,
            durationMs: Date.now() - startedAt,
        });
        return merged;
    }, [mergePendingCreatedOrders]);

    const upsertOrderInState = useCallback((order) => {
        if (!order?.id) return;
        const orderId = String(order.id);
        setOrders((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const withoutCurrent = list.filter((item) => String(item?.id || '') !== orderId);
            const merged = [order, ...withoutCurrent];
            merged.sort((a, b) => {
                const aTs = new Date(a?.created_at || 0).getTime();
                const bTs = new Date(b?.created_at || 0).getTime();
                return bTs - aTs;
            });
            return merged;
        });
    }, []);

    const confirmCreatedOrderPersisted = useCallback(async (orderId, { reason = 'order_create' } = {}) => {
        const normalizedId = String(orderId || '');
        if (!normalizedId) return false;
        const existingTask = createConfirmInFlightRef.current.get(normalizedId);
        if (existingTask) return existingTask;

        const task = (async () => {
            for (let attempt = 0; attempt <= ADMIN_CREATE_CONFIRM_RETRIES; attempt += 1) {
                try {
                    const confirmedOrder = await ordersService.getOrderById(normalizedId);
                    if (confirmedOrder?.id) {
                        pendingCreatedOrdersRef.current.set(normalizedId, {
                            order: confirmedOrder,
                            createdAt: Date.now(),
                        });
                        upsertOrderInState(confirmedOrder);
                        adminDiag('order_create_confirm_hit', { orderId: normalizedId, attempt, reason });
                        markTabsDirty(['orders', 'analytics', 'people'], 'order_create_confirmed');
                        await loadAllOrdersLatestRef.current?.({ reason: `${reason}:confirm` });
                        if ((activeTabRef.current || '') === 'orders') {
                            await ensureTabDataLatestRef.current?.('orders', { force: true, reason: `${reason}:confirm` });
                        }
                        return true;
                    }
                } catch (error) {
                    adminDiag('order_create_confirm_error', {
                        orderId: normalizedId,
                        attempt,
                        reason,
                        message: error?.message || String(error),
                    });
                }
                if (attempt < ADMIN_CREATE_CONFIRM_RETRIES) {
                    await sleep(ADMIN_CREATE_CONFIRM_DELAY_MS);
                }
            }
            adminDiag('order_create_confirm_miss', { orderId: normalizedId, retries: ADMIN_CREATE_CONFIRM_RETRIES, reason });
            return false;
        })();

        createConfirmInFlightRef.current.set(normalizedId, task);
        try {
            return await task;
        } finally {
            if (createConfirmInFlightRef.current.get(normalizedId) === task) {
                createConfirmInFlightRef.current.delete(normalizedId);
            }
        }
    }, [markTabsDirty, upsertOrderInState]);

    const loadOrdersQueue = useCallback(async (targetPage = queuePage, { force = false } = {}) => {
        const loadId = queueLoadIdRef.current + 1;
        queueLoadIdRef.current = loadId;
        const isStale = () => loadId !== queueLoadIdRef.current;
        setQueueLoading(true);
        adminDiag('queue_load_start', {
            loadId,
            targetPage,
            force,
            statusFilter,
            queueSearchDebounced,
            filterDispatcher,
            filterUrgency,
            serviceFilter,
            filterSort,
        });
        try {
            if (force) {
                ordersService.invalidateAdminQueueCache?.();
            }
            const queueRequest = ordersService.getAdminOrdersPage({
                page: targetPage,
                limit: queuePageSize,
                status: statusFilter,
                search: queueSearchDebounced,
                dispatcher: filterDispatcher,
                urgency: filterUrgency,
                serviceType: serviceFilter,
                sort: filterSort,
            });
            const timedPayload = await Promise.race([
                queueRequest,
                new Promise((resolve) => setTimeout(() => resolve('__queue_timeout__'), ADMIN_QUEUE_REQUEST_TIMEOUT_MS)),
            ]);
            if (timedPayload === '__queue_timeout__') {
                adminDiag('queue_load_timeout', {
                    loadId,
                    targetPage,
                    timeoutMs: ADMIN_QUEUE_REQUEST_TIMEOUT_MS,
                });
                const now = Date.now();
                if (now - queueTimeoutToastAtRef.current > ADMIN_QUEUE_TIMEOUT_TOAST_COOLDOWN_MS) {
                    queueTimeoutToastAtRef.current = now;
                    showToast?.(
                        TRANSLATIONS.authRequestTimedOut || 'Request timed out. Please check your connection and retry.',
                        'warning',
                    );
                }
                return null;
            }
            if (isStale()) {
                adminDiag('queue_load_stale', { loadId, targetPage });
                return null;
            }
            const queueItems = Array.isArray(timedPayload?.data) ? timedPayload.data : [];
            const visibleQueueItems = queueItems.filter((item) => !item?.is_disputed);
            const hiddenQueueItems = Math.max(0, queueItems.length - visibleQueueItems.length);
            const rawQueueCount = Number(timedPayload?.count || 0);
            const normalizedQueueCount = Number.isFinite(rawQueueCount)
                ? Math.max(0, rawQueueCount - hiddenQueueItems)
                : visibleQueueItems.length;
            const rawAttentionItems = Array.isArray(timedPayload?.attentionItems) ? timedPayload.attentionItems : [];
            const visibleAttentionItems = rawAttentionItems.filter((item) => !item?.is_disputed);
            const hiddenAttentionItems = Math.max(0, rawAttentionItems.length - visibleAttentionItems.length);
            const rawAttentionCount = Number(timedPayload?.attentionCount || 0);
            const normalizedAttentionCount = Number.isFinite(rawAttentionCount)
                ? Math.max(0, rawAttentionCount - hiddenAttentionItems)
                : visibleAttentionItems.length;
            setQueueOrders(visibleQueueItems);
            setQueueTotalCount(normalizedQueueCount);
            setQueueStatusCountsState(timedPayload?.statusCounts || null);
            setQueueAttentionItemsState(visibleAttentionItems);
            setQueueAttentionCountState(normalizedAttentionCount);
            setQueueSource(timedPayload?.source || 'unknown');
            return timedPayload;
        } catch (e) {
            if (isStale()) return null;
            console.error(`${LOG_PREFIX} Queue load error`, e);
            adminDiag('queue_load_error', { loadId, message: e?.message || String(e) });
            return null;
        } finally {
            if (!isStale()) {
                setQueueLoading(false);
                adminDiag('queue_load_done', { loadId, targetPage });
            }
        }
    }, [
        queuePage,
        queuePageSize,
        statusFilter,
        queueSearchDebounced,
        filterDispatcher,
        filterUrgency,
        serviceFilter,
        filterSort,
        showToast,
        TRANSLATIONS.authRequestTimedOut,
    ]);

    const loadOrders = useCallback(async ({ forceQueue = true, reason = 'orders_sync' } = {}) => {
        await Promise.all([
            loadOrdersQueue(queuePage, { force: forceQueue }),
            loadAllOrders({ reason }),
        ]);
        const loadedAt = Date.now();
        ['orders', 'analytics'].forEach((tabKey) => {
            tabDirtyRef.current[tabKey] = false;
            tabLastLoadedAtRef.current[tabKey] = loadedAt;
            loadedTabsRef.current.add(tabKey);
        });
        adminDiag('orders_sync_done', { reason, queuePage, loadedAt });
    }, [queuePage, loadOrdersQueue, loadAllOrders]);

    const loadMasters = async ({ force = false } = {}) => {
        try {
            const data = await authService.getAllMasters({ force });
            setMasters(data || []);
        } catch (e) { console.error(e); }
    };

    const loadDispatchers = async ({ force = false } = {}) => {
        // Implement if authService supports it, otherwise mock or skip
        try {
            if (authService.getAllDispatchers) {
                const data = await authService.getAllDispatchers({ force });
                setDispatchers(data || []);
            }
        } catch (e) { }
    };

    const loadPartners = async ({ force = false } = {}) => {
        try {
            if (authService.getAllPartners) {
                const data = await authService.getAllPartners({ force });
                setPartners(data || []);
            }
        } catch (e) { }
    };

    const loadAdmins = async ({ force = false } = {}) => {
        try {
            if (authService.getAllAdmins) {
                const data = await authService.getAllAdmins({ force });
                setAdminUsers(data || []);
            }
        } catch (e) { }
    };

    const loadSettings = async () => {
        try {
            const s = await ordersService.getPlatformSettings();
            setSettings(s || {});
        } catch (e) { }
    };

    const confirmDestructive = useCallback((title, message, onConfirm) => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            const ok = window.confirm(`${title}\n\n${message}`);
            if (ok) onConfirm?.();
            return;
        }

        Alert.alert(title, message, [
            { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
            { text: TRANSLATIONS.delete || 'Delete', style: 'destructive', onPress: () => onConfirm?.() },
        ]);
    }, [TRANSLATIONS.cancel, TRANSLATIONS.delete]);

    const loadServiceTypes = async () => {
        try {
            const data = ordersService.getAllServiceTypes
                ? await ordersService.getAllServiceTypes()
                : await ordersService.getServiceTypes();
            setServiceTypes(data || []);
        } catch (e) { console.error(e); }
    };

    const loadDistricts = async () => {
        try {
            const data = await ordersService.getDistricts();
            if (data && data.length > 0) {
                const labelField = language === 'ru' ? 'name_ru' : language === 'kg' ? 'name_kg' : 'name_en';
                setDistricts(data.map(d => ({
                    id: d.code,
                    code: d.code,
                    label: d[labelField] || d.name_en,
                    region: d.region,
                    name_en: d.name_en,
                    name_ru: d.name_ru,
                    name_kg: d.name_kg,
                })));
            }
        } catch (e) { console.error(e); }
    };

    const loadManagedDistricts = async () => {
        try {
            if (ordersService.getAllDistricts) {
                const data = await ordersService.getAllDistricts();
                setManagedDistricts(data || []);
            }
        } catch (e) { console.error(e); }
    };

    const loadCancellationReasons = async () => {
        try {
            if (ordersService.getAllCancellationReasons) {
                const data = await ordersService.getAllCancellationReasons();
                setCancellationReasons(data || []);
            }
        } catch (e) { console.error(e); }
    };

    const loadDisputes = async () => {
        try {
            if (ordersService.getDisputesAdmin) {
                const data = await ordersService.getDisputesAdmin({ status: 'all', limit: 300 });
                setDisputes(data || []);
            } else {
                setDisputes([]);
            }
        } catch (e) {
            console.error(e);
            setDisputes([]);
        }
    };

    const loadPayoutRequests = async ({ status = 'all', limit = 300 } = {}) => {
        try {
            const normalizedStatus = String(status || 'all').trim().toLowerCase();
            const safeLimit = Math.max(1, Math.min(500, Number(limit) || 300));
            const data = await partnerFinanceService.getPartnerPayoutRequestsAdmin({
                status: normalizedStatus === 'all' ? null : normalizedStatus,
                limit: safeLimit,
            });
            setAdminPayoutRequests(data || []);
        } catch (error) {
            console.error(error);
            setAdminPayoutRequests([]);
        }
    };

    const ensureTabData = useCallback(async (tabKey, { force = false, reason = 'unspecified' } = {}) => {
        if (!tabKey) return;
        if (!shouldRefreshTab(tabKey, { force, reason })) {
            adminDiag('tab_load_skip_fresh', { tabKey, reason });
            return;
        }
        const now = Date.now();
        const existingMeta = tabLoadInFlightRef.current.get(tabKey);
        if (existingMeta?.promise) {
            const ageMs = now - (existingMeta.startedAt || now);
            const shouldJoin = ageMs < (force ? ADMIN_TAB_FORCE_JOIN_WINDOW_MS : ADMIN_TAB_INFLIGHT_STALE_MS);
            if (shouldJoin) {
                adminDiag('tab_load_join_inflight', { tabKey, reason, force, ageMs });
                await existingMeta.promise;
                return;
            }
            adminDiag('tab_load_drop_stale_inflight', { tabKey, reason, force, ageMs });
            tabLoadInFlightRef.current.delete(tabKey);
        }
        const loadId = (Number(tabLoadSeqRef.current?.[tabKey] || 0) + 1);
        tabLoadSeqRef.current[tabKey] = loadId;
        const isStaleLoad = () => Number(tabLoadSeqRef.current?.[tabKey] || 0) !== loadId;
        setTabLoading(tabKey, true);

        const task = (async () => {
            const loadTask = (async () => {
                switch (tabKey) {
                    case 'analytics':
                    await Promise.all([
                        loadStats(),
                        loadCommissionData(),
                        loadBalanceTopUpStats(),
                        loadAllOrders({ reason: `tab_${tabKey}:${reason}` }),
                        loadMasters({ force }),
                        loadDispatchers({ force }),
                        loadAdmins({ force }),
                    ]);
                        break;
                    case 'orders':
                    await Promise.all([
                        loadOrdersQueue(force ? 1 : queuePage, { force }),
                        loadAllOrders({ reason: `tab_${tabKey}:${reason}` }),
                        loadDispatchers({ force }),
                        loadAdmins({ force }),
                    ]);
                        break;
                    case 'people':
                        await Promise.all([
                            loadMasters({ force }),
                            loadDispatchers({ force }),
                            loadPartners({ force }),
                            loadAdmins({ force }),
                        ]);
                        break;
                    case 'settings':
                        await Promise.all([
                            loadSettings(),
                            loadServiceTypes(),
                            loadDistricts(),
                            loadManagedDistricts(),
                            loadCancellationReasons(),
                        ]);
                        break;
                    case 'create_order':
                        await Promise.all([loadServiceTypes(), loadDistricts()]);
                        break;
                    case 'disputes':
                        await Promise.all([
                            loadDisputes(),
                            loadDispatchers({ force }),
                            loadAdmins({ force }),
                        ]);
                        break;
                    case 'payouts':
                        await Promise.all([
                            loadPayoutRequests({ status: 'all', limit: 300 }),
                            loadPartners({ force }),
                        ]);
                        break;
                    default:
                        break;
                }
            })();
            const timeoutToken = '__tab_load_timeout__';
            const result = await Promise.race([
                loadTask,
                new Promise((resolve) => setTimeout(() => resolve(timeoutToken), ADMIN_TAB_LOAD_TIMEOUT_MS)),
            ]);
            if (result === timeoutToken) {
                adminDiag('tab_load_timeout', { tabKey, reason, force, loadId, timeoutMs: ADMIN_TAB_LOAD_TIMEOUT_MS });
                tabDirtyRef.current[tabKey] = true;
                return timeoutToken;
            }
            return result;
        })();

        tabLoadInFlightRef.current.set(tabKey, {
            promise: task,
            startedAt: now,
            loadId,
        });
        try {
            const taskResult = await task;
            if (taskResult === '__tab_load_timeout__') {
                return;
            }
            if (isStaleLoad()) {
                adminDiag('tab_load_stale_result_ignored', { tabKey, reason, force, loadId });
                return;
            }
            loadedTabsRef.current.add(tabKey);
            tabDirtyRef.current[tabKey] = false;
            tabLastLoadedAtRef.current[tabKey] = Date.now();
            adminDiag('tab_load_success', { tabKey, reason, force, loadId });
        } finally {
            const activeMeta = tabLoadInFlightRef.current.get(tabKey);
            if (activeMeta?.loadId === loadId) {
                tabLoadInFlightRef.current.delete(tabKey);
            }
            if (!isStaleLoad()) {
                setTabLoading(tabKey, false);
            }
        }
    }, [
        shouldRefreshTab,
        queuePage,
        setTabLoading,
        loadStats,
        loadCommissionData,
        loadBalanceTopUpStats,
        loadAllOrders,
        loadOrdersQueue,
        loadMasters,
        loadDispatchers,
        loadPartners,
        loadAdmins,
        loadSettings,
        loadServiceTypes,
        loadDistricts,
        loadManagedDistricts,
        loadCancellationReasons,
        loadDisputes,
        loadPayoutRequests,
    ]);

    useEffect(() => {
        ensureTabDataLatestRef.current = ensureTabData;
    }, [ensureTabData]);

    useEffect(() => {
        loadAllOrdersLatestRef.current = loadAllOrders;
    }, [loadAllOrders]);

    useEffect(() => {
        if (!ADMIN_REALTIME_SYNC_ENABLED || !authUser?.id) return undefined;
        const channelName = `admin-orders-sync-${authUser.id}`;
        const scheduleRealtimeSync = (trigger = 'unknown') => {
            const now = Date.now();
            const elapsed = now - realtimeLastRunAtRef.current;
            const delayMs = elapsed >= ADMIN_REALTIME_MIN_INTERVAL_MS
                ? ADMIN_REALTIME_DEBOUNCE_MS
                : Math.max(ADMIN_REALTIME_DEBOUNCE_MS, ADMIN_REALTIME_MIN_INTERVAL_MS - elapsed);
            if (realtimeSyncTimerRef.current) {
                clearTimeout(realtimeSyncTimerRef.current);
            }
            realtimeSyncTimerRef.current = setTimeout(async () => {
                realtimeSyncTimerRef.current = null;
                realtimeLastRunAtRef.current = Date.now();
                const currentTab = activeTabRef.current || 'analytics';
                adminDiag('orders_realtime_sync_start', { trigger, currentTab });
                try {
                    await loadAllOrdersLatestRef.current?.({ reason: `orders_realtime:${trigger}` });
                    if (currentTab === 'orders') {
                        await ensureTabDataLatestRef.current?.('orders', { force: true, reason: `orders_realtime:${trigger}` });
                    }
                } catch (error) {
                    console.error(`${LOG_PREFIX} realtime sync failed`, error);
                    adminDiag('orders_realtime_sync_error', {
                        trigger,
                        currentTab,
                        message: error?.message || String(error),
                    });
                }
            }, delayMs);
        };

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                (payload) => {
                    const eventType = String(payload?.eventType || 'unknown').toLowerCase();
                    const orderId = payload?.new?.id || payload?.old?.id || null;
                    adminDiag('orders_realtime_event', { eventType, orderId });
                    markTabsDirty(['orders', 'analytics', 'people', 'disputes'], `orders_realtime_${eventType}`);
                    scheduleRealtimeSync(eventType);
                }
            )
            .subscribe((status) => {
                adminDiag('orders_realtime_status', { status, channel: channelName });
            });

        return () => {
            if (realtimeSyncTimerRef.current) {
                clearTimeout(realtimeSyncTimerRef.current);
                realtimeSyncTimerRef.current = null;
            }
            supabase.removeChannel(channel);
        };
    }, [authUser?.id, markTabsDirty]);

    const loadAllData = useCallback(async (skipLoadingScreen = false) => {
        const loadId = loadAllDataSeqRef.current + 1;
        loadAllDataSeqRef.current = loadId;
        const isStale = () => loadId !== loadAllDataSeqRef.current;
        const startedAt = Date.now();
        if (!skipLoadingScreen) setLoading(true);
        adminDiag('load_all_data_start', { loadId, skipLoadingScreen, activeTab: activeTab || 'analytics' });
        try {
            await loadCurrentUser();
            if (isStale()) {
                adminDiag('load_all_data_stale_after_user', { loadId });
                return;
            }
            await Promise.all([
                loadSettings(),
                loadServiceTypes(),
                loadDistricts(),
            ]);
            if (isStale()) {
                adminDiag('load_all_data_stale_after_bootstrap', { loadId });
                return;
            }
            await ensureTabData(activeTab || 'analytics', { force: true, reason: 'load_all_data' });
        } catch (error) {
            console.error(`${LOG_PREFIX} loadAllData failed`, error);
            adminDiag('load_all_data_error', { loadId, message: error?.message || String(error) });
        } finally {
            const durationMs = Date.now() - startedAt;
            if (durationMs > ADMIN_LOADING_HARD_TIMEOUT_MS) {
                console.warn(`${LOG_PREFIX} loadAllData exceeded soft threshold`, { loadId, durationMs });
            }
            adminDiag('load_all_data_done', { loadId, durationMs, stale: isStale() });
            if (!skipLoadingScreen) setLoading(false);
        }
    }, [activeTab, loadCurrentUser, ensureTabData]);

    useEffect(() => {
        loadAllDataLatestRef.current = loadAllData;
    }, [loadAllData]);

    useEffect(() => {
        if (!authUser?.id) return;
        if (authSyncUserIdRef.current === authUser.id) return;
        authSyncUserIdRef.current = authUser.id;
        adminDiag('auth_user_sync_load', { userId: authUser.id });
        loadAllDataLatestRef.current?.(false);
    }, [authUser?.id]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await ensureTabData(activeTab || 'analytics', { force: true, reason: 'manual_refresh' });
        } finally {
            setRefreshing(false);
        }
    }, [activeTab, ensureTabData]);

    // Handlers
    const handleLogout = async () => {
        try {
            await logout({ scope: 'local' });
        } catch (e) {
            console.error('Logout failed', e);
        } finally {
            setIsSidebarOpen(false);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
    };

    const openAssignModalFromQueue = async (order) => {
        try {
            const mastersData = await ordersService.getAvailableMasters();
            const normalizedMasters = Array.isArray(mastersData) ? mastersData : [];
            assignMastersBaseRef.current = normalizedMasters;
            assignMasterSearchSeqRef.current += 1;
            setAssignMasterSearchQuery('');
            setAssignMasterSearchLoading(false);
            setAvailableMasters(normalizedMasters);
            setIsEditing(false);
            setEditForm({});
            setDetailsOrder(order);
            setAssignOrderId(order?.id || null);
            setShowAssignModal(true);
        } catch (e) {
            console.error('Failed to load available masters', e);
            showToast?.(TRANSLATIONS.toastLoadMastersFailed || 'Failed to load masters', 'error');
        }
    };

    useEffect(() => {
        if (!showAssignModal) {
            assignMasterSearchSeqRef.current += 1;
            setAssignMasterSearchLoading(false);
            return;
        }

        const query = normalizeSearchTerm(assignMasterSearchDebounced);
        if (!query || query.length < 2) {
            setAvailableMasters(assignMastersBaseRef.current || []);
            setAssignMasterSearchLoading(false);
            return;
        }

        const localMatches = (assignMastersBaseRef.current || []).filter((master) => optionMatchesSearch(
            master,
            query,
            ['full_name', 'name', 'phone', 'email', 'service_area']
        ));
        if (localMatches.length > 0) {
            setAvailableMasters(localMatches);
        }

        const requestId = assignMasterSearchSeqRef.current + 1;
        assignMasterSearchSeqRef.current = requestId;
        let cancelled = false;
        setAssignMasterSearchLoading(true);

        ordersService.getAvailableMasters({ search: query, force: true, limit: 80, offset: 0 })
            .then((data) => {
                if (cancelled || requestId !== assignMasterSearchSeqRef.current) return;
                setAvailableMasters(Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                if (cancelled || requestId !== assignMasterSearchSeqRef.current) return;
                console.error(`${LOG_PREFIX} assign master search failed`, error);
                setAvailableMasters(localMatches);
            })
            .finally(() => {
                if (cancelled || requestId !== assignMasterSearchSeqRef.current) return;
                setAssignMasterSearchLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [showAssignModal, assignMasterSearchDebounced]);

    const openOrderDetails = (order) => {
        setIsEditing(false);
        setEditForm({});
        setDetailsOrder(order);
    };

    const handleSaveServiceType = async (typeData) => {
        setActionLoading(true);
        try {
            const { icon, ...payload } = typeData || {};
            const result = payload.id
                ? await ordersService.updateServiceType(payload.id, payload)
                : await ordersService.addServiceType(payload);
            if (!result?.success) {
                throw new Error(result?.message || 'Failed to save service type');
            }
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
            setServiceTypeModal({ visible: false, type: null });
            markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'service_type_save');
            loadServiceTypes();
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteServiceType = async (id) => {
        confirmDestructive(
            TRANSLATIONS.deleteService || 'Delete Service',
            TRANSLATIONS.confirmDeleteService || 'Are you sure?',
            async () => {
                try {
                    setActionLoading(true);
                    const result = await ordersService.deleteServiceType(id);
                    if (!result?.success) throw new Error(result?.message || 'Failed to delete service type');
                    if (serviceTypeModal?.visible && serviceTypeModal?.type?.id === id) {
                        setServiceTypeModal({ visible: false, type: null });
                    }
                    markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'service_type_delete');
                    await loadServiceTypes();
                    showToast(TRANSLATIONS.toastDeleted || 'Deleted', 'success');
                } catch (e) {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                } finally {
                    setActionLoading(false);
                }
            }
        );
    };

    const handleSaveDistrict = async (districtData) => {
        if (!districtData?.code || !districtData?.name_en) {
            showToast(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const payload = {
                code: districtData.code,
                name_en: districtData.name_en,
                name_ru: districtData.name_ru || null,
                name_kg: districtData.name_kg || null,
                region: districtData.region || 'bishkek',
                sort_order: districtData.sort_order ? parseInt(districtData.sort_order, 10) : 99,
                is_active: districtData.is_active !== false,
            };
            const result = districtData.id
                ? await ordersService.updateDistrict(districtData.id, payload)
                : await ordersService.addDistrict(payload);
            if (!result?.success) {
                throw new Error(result?.message || 'Failed to save district');
            }
            setDistrictModal({ visible: false, district: null });
            markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'district_save');
            loadManagedDistricts();
            loadDistricts();
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteDistrict = async (id) => {
        confirmDestructive(
            TRANSLATIONS.deleteDistrict || 'Delete District',
            TRANSLATIONS.confirmDeleteDistrict || 'Are you sure?',
            async () => {
                try {
                    setActionLoading(true);
                    const result = await ordersService.deleteDistrict(id);
                    if (!result?.success) throw new Error(result?.message || 'Failed to delete district');
                    if (districtModal?.visible && districtModal?.district?.id === id) {
                        setDistrictModal({ visible: false, district: null });
                    }
                    markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'district_delete');
                    await Promise.all([loadManagedDistricts(), loadDistricts()]);
                    showToast(TRANSLATIONS.toastDeleted || 'Deleted', 'success');
                } catch (e) {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                } finally {
                    setActionLoading(false);
                }
            }
        );
    };

    const handleSaveCancellationReason = async (reasonData) => {
        if (!reasonData?.code || !reasonData?.name_en) {
            showToast(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const payload = {
                code: reasonData.code,
                name_en: reasonData.name_en,
                name_ru: reasonData.name_ru || null,
                name_kg: reasonData.name_kg || null,
                applicable_to: reasonData.applicable_to || 'both',
                sort_order: reasonData.sort_order ? parseInt(reasonData.sort_order, 10) : 0,
                is_active: reasonData.is_active !== false,
            };
            const result = reasonData.id
                ? await ordersService.updateCancellationReason(reasonData.id, payload)
                : await ordersService.addCancellationReason(payload);
            if (!result?.success) {
                throw new Error(result?.message || 'Failed to save cancellation reason');
            }
            setCancellationReasonModal({ visible: false, reason: null });
            markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'cancellation_reason_save');
            loadCancellationReasons();
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteCancellationReason = async (id) => {
        confirmDestructive(
            TRANSLATIONS.deleteCancellationReason || 'Delete Reason',
            TRANSLATIONS.confirmDeleteCancellationReason || 'Are you sure?',
            async () => {
                try {
                    setActionLoading(true);
                    const result = await ordersService.deleteCancellationReason(id);
                    if (!result?.success) throw new Error(result?.message || 'Failed to delete cancellation reason');
                    if (cancellationReasonModal?.visible && cancellationReasonModal?.reason?.id === id) {
                        setCancellationReasonModal({ visible: false, reason: null });
                    }
                    markTabsDirty(['settings', 'analytics', 'create_order', 'orders'], 'cancellation_reason_delete');
                    await loadCancellationReasons();
                    showToast(TRANSLATIONS.toastDeleted || 'Deleted', 'success');
                } catch (e) {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (e?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                } finally {
                    setActionLoading(false);
                }
            }
        );
    };

    // --- Ported Actions ---
    const handleCreateOrder = async () => {
        if (!confirmChecked) { showToast?.(TRANSLATIONS.toastConfirmDetails || 'Please confirm details', 'error'); return; }
        if (!newOrder.clientName?.trim()) {
            showToast?.(TRANSLATIONS.toastClientNameRequired || 'Client name is required', 'error'); return;
        }
        if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
            showToast?.(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error'); return;
        }
        if (phoneError) { showToast?.(TRANSLATIONS.toastFixPhone || 'Fix phone format', 'error'); return; }

        const parsedCallout = newOrder.calloutFee !== '' && newOrder.calloutFee !== null && newOrder.calloutFee !== undefined
            ? parseFloat(newOrder.calloutFee)
            : null;
        const calloutValue = !isNaN(parsedCallout) ? parsedCallout : null;
        const parsedInitial = newOrder.initialPrice !== '' && newOrder.initialPrice !== null && newOrder.initialPrice !== undefined
            ? parseFloat(newOrder.initialPrice)
            : null;
        const initialValue = !isNaN(parsedInitial) ? parsedInitial : null;

        if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
            showToast?.(TRANSLATIONS.errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
            return;
        }

        setActionLoading(true);
        try {
            // Admin ID used as dispatcher ID for creation tracking
            const result = await ordersService.createOrderExtended({
                clientName: newOrder.clientName,
                clientPhone: newOrder.clientPhone,
                pricingType: newOrder.pricingType === 'fixed' ? 'fixed' : 'unknown',
                initialPrice: newOrder.pricingType === 'fixed' ? (parseFloat(newOrder.initialPrice) || null) : null,
                calloutFee: calloutValue,
                serviceType: newOrder.serviceType,
                urgency: newOrder.urgency,
                problemDescription: newOrder.problemDescription,
                area: newOrder.area,
                fullAddress: newOrder.fullAddress,
                orientir: newOrder.orientir || null,
                preferredDate: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : null,
                preferredTime: newOrder.preferredTime || null,
                dispatcherNote: newOrder.dispatcherNote,
            }, user?.id);

            if (result.success) {
                showToast(TRANSLATIONS.toastOrderCreated || 'Order created!', 'success');
                setCreationSuccess({ id: result.orderId });
                setConfirmChecked(false);
                const createdOrderId = String(result.order?.id || result.orderId || '');
                if (createdOrderId) {
                    if (result.order) {
                        pendingCreatedOrdersRef.current.set(createdOrderId, {
                            order: result.order,
                            createdAt: Date.now(),
                        });
                        upsertOrderInState(result.order);
                        adminDiag('order_create_optimistic_seed', { orderId: createdOrderId });
                    }
                    void confirmCreatedOrderPersisted(createdOrderId, { reason: 'order_create' });
                }
                markTabsDirty(['orders', 'analytics', 'people'], 'order_create');
                loadOrders({ reason: 'order_create' }); // Refresh list
            } else {
                showToast(TRANSLATIONS.toastCreateFailed || 'Create failed', 'error');
            }
        } catch (error) {
            showToast(TRANSLATIONS.toastCreateFailed || 'Create failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const clearCreateOrderForm = () => {
        const defaultCallout = settings?.default_guaranteed_payout ? String(settings.default_guaranteed_payout) : '';
        setNewOrder({ ...INITIAL_ORDER_STATE, calloutFee: defaultCallout });
        setConfirmChecked(false);
        setPhoneError('');
        setCreationSuccess(null);
        setShowDatePicker(false);
        setShowTimePicker(false);
    };

    const keepLocationAndReset = () => {
        const defaultCallout = settings?.default_guaranteed_payout ? String(settings.default_guaranteed_payout) : '';
        setNewOrder(prev => ({
            ...INITIAL_ORDER_STATE,
            calloutFee: defaultCallout,
            area: prev.area,
            fullAddress: prev.fullAddress
        }));
        setConfirmChecked(false);
        setPhoneError('');
        setCreationSuccess(null);
        setShowDatePicker(false);
        setShowTimePicker(false);
    };

    const handlePhoneBlur = () => {
        const normalized = normalizeKyrgyzPhone(newOrder.clientPhone);
        const nextValue = normalized || newOrder.clientPhone;
        setNewOrder(prev => ({ ...prev, clientPhone: nextValue }));
        setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? (TRANSLATIONS.errorPhoneFormat || 'Invalid phone format') : '');
    };

    const handlePastePhone = async () => {
        try {
            let text = '';
            if (Platform.OS === 'web' && navigator?.clipboard) {
                text = await navigator.clipboard.readText();
            } else {
                text = await Clipboard.getString();
            }
            if (text) {
                const normalized = normalizeKyrgyzPhone(text);
                const nextValue = normalized || text;
                setNewOrder(prev => ({ ...prev, clientPhone: nextValue }));
                showToast?.(TRANSLATIONS.toastPasted || 'Pasted & formatted', 'success');
                setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? (TRANSLATIONS.errorPhoneFormat || 'Invalid phone format') : '');
            } else {
                showToast?.(TRANSLATIONS.toastClipboardEmpty || 'Clipboard empty', 'info');
            }
        } catch (e) {
            showToast?.(TRANSLATIONS.toastPasteFailed || 'Paste failed', 'error');
        }
    };

    const copyToClipboard = async (value) => {
        if (!value) return;
        try {
            const text = String(value);
            if (Platform.OS === 'web' && navigator?.clipboard) {
                await navigator.clipboard.writeText(text);
            } else {
                Clipboard.setString(text);
            }
            showToast?.(TRANSLATIONS.toastCopied || 'Copied', 'success');
        } catch (e) {
            showToast?.(TRANSLATIONS.toastCopyFailed || 'Copy failed', 'error');
        }
    };

    const handleSaveEdit = async () => {
        setActionLoading(true);
        try {
            const parsedCallout = editForm.callout_fee !== '' && editForm.callout_fee !== null && editForm.callout_fee !== undefined
                ? parseFloat(editForm.callout_fee)
                : null;
            const calloutValue = !isNaN(parsedCallout) ? parsedCallout : null;
            const parsedInitial = editForm.initial_price !== '' && editForm.initial_price !== null && editForm.initial_price !== undefined
                ? parseFloat(editForm.initial_price)
                : null;
            const initialValue = !isNaN(parsedInitial) ? parsedInitial : null;

            if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
                showToast?.(TRANSLATIONS.errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
                setActionLoading(false);
                return;
            }

            const canEditFinal = ['completed', 'confirmed'].includes(detailsOrder?.status);
            const parsedFinal = canEditFinal && editForm.final_price !== '' && editForm.final_price !== null && editForm.final_price !== undefined
                ? parseFloat(editForm.final_price)
                : null;
            const finalValue = !isNaN(parsedFinal) ? parsedFinal : null;
            const existingFinal = detailsOrder?.final_price !== null && detailsOrder?.final_price !== undefined
                ? parseFloat(detailsOrder.final_price)
                : null;
            const finalChanged = canEditFinal && finalValue !== null && (existingFinal === null || finalValue !== existingFinal);

            if (finalChanged && calloutValue !== null && finalValue < calloutValue) {
                showToast?.(TRANSLATIONS.errorInitialBelowCallout || 'Final price cannot be lower than call-out fee', 'error');
                setActionLoading(false);
                return;
            }

            const updates = {
                problem_description: editForm.problem_description,
                dispatcher_note: editForm.dispatcher_note,
                full_address: editForm.full_address,
                area: editForm.area,
                orientir: editForm.orientir || null,
                callout_fee: editForm.callout_fee,
                initial_price: editForm.initial_price,
                client_name: editForm.client_name || detailsOrder.client?.full_name,
                client_phone: editForm.client_phone || detailsOrder.client?.phone
            };

            if (finalChanged && ordersService.overrideFinalPriceAdmin) {
                const overrideResult = await ordersService.overrideFinalPriceAdmin(detailsOrder.id, finalValue, 'admin_price_override');
                if (!overrideResult?.success) {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (overrideResult?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                    setActionLoading(false);
                    return;
                }
            }

            const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setIsEditing(false);
                markTabsDirty(['orders', 'analytics', 'people'], 'order_edit');
                loadOrders({ reason: 'order_edit' });
                setDetailsOrder(prev => ({
                    ...prev,
                    ...editForm,
                    final_price: finalChanged ? finalValue : prev.final_price,
                    client: { ...prev.client, full_name: editForm.client_name, phone: editForm.client_phone }
                }));
            } else { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleVerifyMaster = async (masterId, isVerified) => {
        setActionLoading(true);
        try {
            const res = isVerified
                ? await authService.unverifyMaster(masterId)
                : await authService.verifyMaster(masterId);

            if (res.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                markTabsDirty(['people', 'analytics', 'orders'], 'verify_master');
                loadMasters({ force: true });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleVerifyDispatcher = async (dispatcherId, isVerified) => {
        setActionLoading(true);
        try {
            const res = isVerified
                ? await authService.unverifyDispatcher(dispatcherId)
                : await authService.verifyDispatcher(dispatcherId);
            if (res.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                markTabsDirty(['people', 'analytics', 'orders'], 'verify_dispatcher');
                loadDispatchers({ force: true });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (res.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleVerifyPartner = async (partnerId, isVerified) => {
        setActionLoading(true);
        try {
            const res = isVerified
                ? await authService.unverifyPartner(partnerId)
                : await authService.verifyPartner(partnerId);
            if (res.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                markTabsDirty(['people', 'analytics', 'orders'], 'verify_partner');
                await loadPartners({ force: true });
                if (detailsPerson?.id === partnerId && detailsPerson?.type === 'partner') {
                    setDetailsPerson((prev) => prev ? ({
                        ...prev,
                        is_verified: !isVerified,
                        is_active: !isVerified ? true : prev.is_active,
                    }) : prev);
                }
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (res.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally { setActionLoading(false); }
    };

    const handleSavePartnerTerms = async () => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        if (!activePartner?.id) return;
        const commission = Number(partnerCommissionInput);
        const minPayout = Number(partnerMinPayoutInput);
        if (!Number.isFinite(commission) || commission < 0) {
            showToast(TRANSLATIONS.invalidAmount || 'Invalid amount', 'error');
            return;
        }
        if (!Number.isFinite(minPayout) || minPayout < 0) {
            showToast(TRANSLATIONS.invalidAmount || 'Invalid amount', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const [rateRes, payoutRes] = await Promise.all([
                partnerFinanceService.setPartnerCommissionRate(activePartner.id, commission),
                partnerFinanceService.setPartnerMinPayout(activePartner.id, minPayout),
            ]);
            if (!rateRes?.success || !payoutRes?.success) {
                const message = rateRes?.message || payoutRes?.message || TRANSLATIONS.errorGeneric || 'Error';
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + message, 'error');
                return;
            }
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
            markTabsDirty(['people', 'analytics'], 'partner_terms_update');
            await loadPartners({ force: true });
            const cacheKey = `partner:${activePartner.id}`;
            partnerFinanceCache.current.delete(cacheKey);
            setDetailsPerson((prev) => (prev?.id === activePartner.id && prev?.type === 'partner') ? ({
                ...prev,
                partner_commission_rate: commission / 100,
                partner_min_payout: minPayout,
            }) : prev);
            const summary = await loadPartnerFinanceSummary(activePartner, true);
            setPartnerFinanceSummary(summary);
            setIsEditingPartnerTerms(false);
        } catch (error) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (error?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeductPartnerBalance = async () => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        if (!activePartner?.id) return;
        const amount = Number(partnerDeductAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast(TRANSLATIONS.invalidAmount || 'Invalid amount', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const res = await partnerFinanceService.deductPartnerBalance(
                activePartner.id,
                amount,
                partnerDeductReason?.trim() || null
            );
            if (!res?.success) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (res?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                return;
            }
            showToast(res?.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
            setPartnerDeductAmount('');
            setPartnerDeductReason('');
            await loadPartners({ force: true });
            const summary = await loadPartnerFinanceSummary(activePartner, true);
            setPartnerFinanceSummary(summary);
            setDetailsPerson((prev) => (prev?.id === activePartner.id && prev?.type === 'partner')
                ? ({ ...prev, partner_balance: summary?.balance ?? prev.partner_balance })
                : prev);
            setIsEditingPartnerBalance(false);
        } catch (error) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (error?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleTopUpPartnerBalance = async () => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        if (!activePartner?.id) return;
        const amount = Number(partnerDeductAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast(TRANSLATIONS.invalidAmount || 'Invalid amount', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const res = await partnerFinanceService.topUpPartnerBalance(
                activePartner.id,
                amount,
                partnerDeductReason?.trim() || null
            );
            if (!res?.success) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (res?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                return;
            }
            showToast(res?.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
            setPartnerDeductAmount('');
            setPartnerDeductReason('');
            await loadPartners({ force: true });
            const summary = await loadPartnerFinanceSummary(activePartner, true);
            setPartnerFinanceSummary(summary);
            setDetailsPerson((prev) => (prev?.id === activePartner.id && prev?.type === 'partner')
                ? ({ ...prev, partner_balance: summary?.balance ?? prev.partner_balance })
                : prev);
            setIsEditingPartnerBalance(false);
        } catch (error) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (error?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleProcessPartnerPayout = async (requestItem, actionType = 'paid') => {
        if (!requestItem?.id) return;
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        let approvedAmount = null;
        if (actionType === 'paid') {
            if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.prompt === 'function') {
                const entered = window.prompt(
                    TRANSLATIONS.partnerPayoutAmountPrompt || 'Enter payout amount (leave empty to use requested amount)',
                    String(requestItem.requested_amount || '')
                );
                if (entered === null) return;
                const parsed = Number(String(entered).trim());
                approvedAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : Number(requestItem.requested_amount || 0);
            } else {
                approvedAmount = Number(requestItem.requested_amount || 0);
            }
        }

        setActionLoading(true);
        try {
            const result = await partnerFinanceService.processPartnerPayoutRequest(
                requestItem.id,
                actionType,
                actionType === 'paid' ? approvedAmount : null,
                null
            );
            if (!result?.success) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (result?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                return;
            }
            showToast(result?.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
            markTabsDirty(['payouts', 'people', 'analytics'], `partner_payout_${actionType}`);
            await loadPayoutRequests({ status: 'all', limit: 300 });
            await loadPartners({ force: true });
            if (activePartner?.id) {
                const summary = await loadPartnerFinanceSummary(activePartner, true);
                setPartnerFinanceSummary(summary);
                setDetailsPerson((prev) => (prev?.id === activePartner.id && prev?.type === 'partner')
                    ? ({ ...prev, partner_balance: summary?.balance ?? prev.partner_balance })
                    : prev);
            }
        } catch (error) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (error?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleProcessPayoutFromTab = async (requestItem, actionType = 'paid') => {
        if (!requestItem?.id) return;
        const requestId = String(requestItem.id);
        const action = String(actionType || '').toLowerCase();
        if (!['paid', 'rejected'].includes(action)) return;

        let approvedAmount = null;
        if (action === 'paid') {
            const requestedAmount = Number(requestItem?.requested_amount || 0);
            if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.prompt === 'function') {
                const entered = window.prompt(
                    TRANSLATIONS.partnerPayoutAmountPrompt || 'Enter payout amount (leave empty to use requested amount)',
                    String(requestedAmount || '')
                );
                if (entered === null) return;
                const parsed = Number(String(entered).trim());
                approvedAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : requestedAmount;
            } else {
                approvedAmount = requestedAmount;
            }
            if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
                showToast?.(TRANSLATIONS.invalidAmount || 'Invalid amount', 'error');
                return;
            }
        }

        const partnerName = requestItem?.partner?.full_name
            || requestItem?.partner?.email
            || requestItem?.partner?.phone
            || `${TRANSLATIONS.partnerRole || 'Partner'} ${String(requestItem?.partner_id || '').slice(0, 6)}`;
        const requestedAmountText = Number(requestItem?.requested_amount || 0).toFixed(2);
        const confirmationMessage = action === 'paid'
            ? `${TRANSLATIONS.markPaid || 'Mark paid'} ${requestedAmountText} ${TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}?\n${partnerName}`
            : `${TRANSLATIONS.reject || 'Reject'} ${TRANSLATIONS.payouts || 'payout'} request?\n${partnerName}`;

        const executeAction = async () => {
            setActionLoading(true);
            setAdminPayoutActionId(requestId);
            try {
                const result = await partnerFinanceService.processPartnerPayoutRequest(
                    requestItem.id,
                    action,
                    action === 'paid' ? approvedAmount : null,
                    null
                );
                if (!result?.success) {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (result?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                    return;
                }
                showToast(result?.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
                markTabsDirty(['payouts', 'people', 'analytics'], `partner_payout_${action}`);
                await Promise.all([
                    loadPayoutRequests({ status: 'all', limit: 300 }),
                    loadPartners({ force: true }),
                ]);
            } catch (error) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (error?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
            } finally {
                setAdminPayoutActionId(null);
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (window.confirm(confirmationMessage)) {
                await executeAction();
            }
            return;
        }

        Alert.alert(
            TRANSLATIONS.payouts || 'Payouts',
            confirmationMessage,
            [
                { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
                { text: TRANSLATIONS.confirm || 'Confirm', onPress: () => { void executeAction(); } },
            ],
        );
    };

    // --- NEW: Missing Admin Handlers ---
    const handleReopenOrder = async (orderId) => {
        const runReopen = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.reopenOrderAdmin(orderId, 'Reopened by admin');
                if (result.success) {
                    showToast(TRANSLATIONS.filterStatusReopened || TRANSLATIONS.toastUpdated || 'Updated', 'success');
                    setDetailsOrder(null);
                    markTabsDirty(['orders', 'analytics', 'people'], 'order_reopen');
                    loadOrders({ reason: 'order_reopen' });
                } else {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                }
            } catch (e) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            } finally {
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
            if (window.confirm('Return this order to the pool for new claims?')) {
                runReopen();
            }
            return;
        }

        Alert.alert('Reopen Order', 'Return this order to the pool for new claims?', [
            { text: 'Cancel' },
            { text: 'Reopen', onPress: runReopen }
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
                            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                            markTabsDirty(['orders', 'analytics', 'people'], 'order_expire');
                            loadOrders({ reason: 'order_expire' });
                            loadStats();
                        } else {
                            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                        }
                    } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
                    finally { setActionLoading(false); }
                }
            }
        ]);
    };

    const handleForceAssignMaster = async (orderId, masterId, masterName) => {
        if (!orderId || !masterId) {
            showToast?.(TRANSLATIONS.toastMissingData || 'Missing order or master', 'error');
            return;
        }
        const confirmAssign = async () => {
            setActionLoading(true);
            try {
                const targetOrder = detailsOrder?.id === orderId ? detailsOrder : null;
                const needsReassign = !!(targetOrder?.master_id || targetOrder?.master);
                if (needsReassign) {
                    const unassignRes = await ordersService.unassignMasterAdmin(orderId, 'admin_reassign');
                    if (!unassignRes.success) {
                        showToast(TRANSLATIONS.toastAssignFail || 'Assignment failed', 'error');
                        setActionLoading(false);
                        return;
                    }
                }
                const result = await ordersService.forceAssignMasterAdmin(orderId, masterId, 'Admin assignment');
                if (result.success) {
                    showToast(TRANSLATIONS.toastMasterAssigned || 'Master assigned!', 'success');
                    setDetailsOrder(null);
                    setShowAssignModal(false);
                    markTabsDirty(['orders', 'analytics', 'people'], 'order_assign_master');
                    loadOrders({ reason: 'order_assign_master' });
                } else {
                    showToast(TRANSLATIONS.toastAssignFail || 'Assignment failed', 'error');
                }
            } catch (e) {
                showToast(TRANSLATIONS.toastAssignFail || 'Assignment failed', 'error');
            } finally {
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
            if (window.confirm(`Assign this order to ${masterName}?`)) {
                confirmAssign();
            }
        } else {
            Alert.alert('Force Assign', `Assign this order to ${masterName}?`, [
                { text: 'Cancel' },
                { text: 'Assign', onPress: confirmAssign }
            ]);
        }
    };

    const handleConfirmPaymentAdmin = async (orderId, finalAmount = null) => {
        if (!orderId) return;
        Alert.alert(TRANSLATIONS.confirmPayment || 'Confirm Payment', TRANSLATIONS.confirmPaymentPrompt || 'Mark this order as paid?', [
            { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
            {
                text: TRANSLATIONS.confirm || 'Confirm',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        if (ordersService.confirmPaymentAdmin) {
                            await ordersService.confirmPaymentAdmin(orderId, { finalAmount });
                        } else {
                            await ordersService.updateOrder(orderId, {
                                status: ORDER_STATUS.CONFIRMED,
                                confirmed_at: new Date().toISOString(),
                                final_price: finalAmount,
                                payment_method: 'other',
                                payment_proof_url: null
                            });
                        }
                        showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                        setDetailsOrder(null);
                        markTabsDirty(['orders', 'analytics', 'people'], 'payment_confirm_admin');
                        loadOrders({ reason: 'payment_confirm_admin' });
                        loadStats();
                    } catch (e) {
                        showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                    } finally {
                        setActionLoading(false);
                    }
                }
            }
        ]);
    };

    const handleConfirmPaymentModal = async () => {
        if (!paymentOrder?.id) {
            showToast?.(TRANSLATIONS.toastNoOrderSelected || 'No order selected', 'error');
            return;
        }
        const rawFinalAmount = String(paymentData?.finalAmount ?? '').trim();
        if (!rawFinalAmount) {
            showToast?.(TRANSLATIONS.labelFinalAmountRequired || 'Final amount is required', 'error');
            return;
        }
        const parsedFinalAmount = Number(rawFinalAmount);
        if (!Number.isFinite(parsedFinalAmount) || parsedFinalAmount <= 0) {
            showToast?.(TRANSLATIONS.labelFinalAmountInvalid || 'Final amount must be a positive number', 'error');
            return;
        }
        setActionLoading(true);
        try {
            const result = paymentOrder?.is_disputed
                ? await ordersService.resolveDisputedOrderAdmin(paymentOrder.id, { finalAmount: parsedFinalAmount })
                : await ordersService.confirmPaymentAdmin(paymentOrder.id, { finalAmount: parsedFinalAmount });
            if (result.success) {
                showToast(
                    paymentOrder?.is_disputed
                        ? (TRANSLATIONS.toastDisputeResolved || 'Dispute resolved')
                        : (TRANSLATIONS.toastPaymentConfirmed || 'Payment confirmed'),
                    'success',
                );
                setShowPaymentModal(false);
                setPaymentOrder(null);
                setPaymentData({ ...DEFAULT_PAYMENT_CONFIRMATION_DATA });
                setDetailsOrder(null);
                markTabsDirty(['orders', 'analytics', 'people', 'disputes'], paymentOrder?.is_disputed ? 'dispute_resolve_modal' : 'payment_confirm_modal');
                await Promise.all([
                    loadOrders({ reason: paymentOrder?.is_disputed ? 'dispute_resolve_modal' : 'payment_confirm_modal' }),
                    loadStats(),
                    loadDisputes(),
                ]);
            } else {
                showToast(result.message || ((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error')), 'error');
            }
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReportMasterFromPaymentModal = async () => {
        if (!paymentOrder?.id) {
            showToast?.(TRANSLATIONS.toastNoOrderSelected || 'No order selected', 'error');
            return;
        }
        if (paymentOrder?.is_disputed) {
            showToast?.(TRANSLATIONS.toastMasterAlreadyReported || 'Order already has a dispute report', 'info');
            return;
        }
        const reason = String(paymentData?.reportReason || '').trim();
        if (!reason) {
            showToast?.(TRANSLATIONS.labelReportReasonRequired || 'Please add a report reason', 'error');
            return;
        }
        const parsedFinalAmount = Number(String(paymentData?.finalAmount ?? '').trim());
        const normalizedFinalAmount = Number.isFinite(parsedFinalAmount) && parsedFinalAmount > 0
            ? parsedFinalAmount
            : null;

        setActionLoading(true);
        try {
            const result = await ordersService.reportPaymentDispute(paymentOrder.id, {
                reason,
                disputeType: 'price_disagreement',
                source: 'payment_confirmation',
                reportedFinalAmount: normalizedFinalAmount,
                masterFinalAmount: paymentOrder?.final_price ?? paymentOrder?.initial_price ?? null,
                workPerformed: paymentOrder?.work_performed || paymentData?.workPerformed || null,
                hoursWorked: paymentOrder?.hours_worked ?? paymentData?.hoursWorked ?? null,
            });
            if (result.success) {
                showToast(TRANSLATIONS.toastMasterReported || 'Master reported for review', 'success');
                setShowPaymentModal(false);
                setPaymentOrder(null);
                setPaymentData({ ...DEFAULT_PAYMENT_CONFIRMATION_DATA });
                markTabsDirty(['orders', 'analytics', 'people', 'disputes'], 'payment_report_master');
                await Promise.all([
                    loadOrders({ reason: 'payment_report_master' }),
                    loadDisputes(),
                ]);
            } else {
                showToast(result.message || ((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error')), 'error');
            }
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const openMasterDetails = async (master) => {
        if (!master?.id) {
            showToast?.(TRANSLATIONS.errorMasterDetailsUnavailable || 'Master details unavailable', 'error');
            return;
        }
        setShowMasterDetails(true);
        setMasterDetails({ profile: master, summary: null });
        setMasterDetailsLoading(true);
        setMasterBalanceHistory([]);
        setMasterBalanceHistoryLoading(true);
        try {
            const [summary, history] = await Promise.all([
                earningsService.getMasterFinancialSummary(master.id),
                earningsService.getBalanceTransactions(master.id, 10),
            ]);
            setMasterDetails({ profile: master, summary });
            setMasterBalanceHistory(history || []);
        } catch (e) {
            setMasterDetails({ profile: master, summary: null });
            setMasterBalanceHistory([]);
        } finally {
            setMasterDetailsLoading(false);
            setMasterBalanceHistoryLoading(false);
        }
    };

    const closeMasterDetails = () => {
        setShowMasterDetails(false);
        setMasterDetails(null);
        setMasterDetailsLoading(false);
        setMasterBalanceHistory([]);
        setMasterBalanceHistoryLoading(false);
    };

    const handleCancelOrderAdmin = async (orderId) => {
        if (!orderId) return;
        const confirmCancel = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.cancelOrderAdmin(orderId, 'admin_cancel');
                if (result.success) {
                    showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                    setDetailsOrder(null);
                    markTabsDirty(['orders', 'analytics', 'people'], 'order_cancel_admin');
                    loadOrders({ reason: 'order_cancel_admin' });
                    loadStats();
                } else {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                }
            } catch (e) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            } finally {
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
            if (window.confirm(TRANSLATIONS.alertCancelMsg || 'Cancel this order?')) {
                confirmCancel();
            }
        } else {
            Alert.alert(TRANSLATIONS.alertCancelTitle || 'Cancel Order', TRANSLATIONS.alertCancelMsg || 'Cancel this order?', [
                { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
                { text: TRANSLATIONS.alertCancelBtn || TRANSLATIONS.confirm || 'Cancel', style: 'destructive', onPress: confirmCancel }
            ]);
        }
    };

    const handleUnassignMaster = async (orderId) => {
        const confirmRemove = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.unassignMasterAdmin(orderId, 'admin_unassign');
                if (result.success) {
                    showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                    setDetailsOrder(null);
                    markTabsDirty(['orders', 'analytics', 'people'], 'order_unassign_master');
                    loadOrders({ reason: 'order_unassign_master' });
                } else {
                    showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                }
            } catch (e) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            } finally {
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
            if (window.confirm(TRANSLATIONS.confirmUnassignMsg || 'Remove the assigned master and reopen this order?')) {
                confirmRemove();
            }
        } else {
            Alert.alert(
                TRANSLATIONS.confirmUnassignTitle || 'Remove Master',
                TRANSLATIONS.confirmUnassignMsg || 'Remove the assigned master and reopen this order?',
                [
                    { text: TRANSLATIONS.cancel || 'Cancel' },
                    { text: TRANSLATIONS.remove || 'Remove', style: 'destructive', onPress: confirmRemove }
                ]
            );
        }
    };

    const openTransferPicker = (order) => {
        if (!order) return;
        const currentAssigned = order.assigned_dispatcher_id || order.dispatcher_id;
        const buildTransferOptions = (dispatcherRows = [], adminRows = []) => {
            const map = new Map();
            const pushOption = (row, roleFallback, fallbackPrefix) => {
                if (!row?.id) return;
                const id = String(row.id);
                if (String(id) === String(currentAssigned)) return;
                if (map.has(id)) return;
                const role = row.role || roleFallback;
                const roleLabel = role === 'admin'
                    ? (TRANSLATIONS.adminRole || TRANSLATIONS.admin || 'Admin')
                    : (TRANSLATIONS.dispatcherRole || TRANSLATIONS.analyticsDispatcher || 'Dispatcher');
                const subtitleParts = [row.phone, row.email, roleLabel].filter(Boolean);
                map.set(id, {
                    id,
                    label: row.full_name || row.name || row.email || row.phone || `${fallbackPrefix} ${id.slice(0, 6)}`,
                    full_name: row.full_name || row.name || '',
                    phone: row.phone || '',
                    email: row.email || '',
                    role,
                    subtitle: subtitleParts.join(' | '),
                });
            };
            (dispatcherRows || []).forEach((row) => pushOption(row, 'dispatcher', 'Dispatcher'));
            (adminRows || []).forEach((row) => pushOption(row, 'admin', 'Admin'));
            return Array.from(map.values()).sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
        };

        const options = buildTransferOptions(dispatchers, adminUsers);

        if (options.length === 0) {
            showToast?.(TRANSLATIONS.noDispatchersFound || 'No other dispatchers found', 'info');
            return;
        }

        const searchTransferOptions = async (queryText) => {
            const query = normalizeSearchTerm(queryText);
            if (!query || query.length < 2) {
                return options;
            }
            const localMatches = options.filter((opt) => optionMatchesSearch(opt, query, ['label', 'full_name', 'phone', 'email', 'role']));
            try {
                const [dispatcherRows, adminRows] = await Promise.all([
                    authService.getAllDispatchers ? authService.getAllDispatchers({ search: query, force: true, pageSize: 80 }) : Promise.resolve([]),
                    authService.getAllAdmins ? authService.getAllAdmins({ search: query, force: true, pageSize: 80 }) : Promise.resolve([]),
                ]);
                const remoteOptions = buildTransferOptions(dispatcherRows || [], adminRows || []);
                return remoteOptions.length > 0 ? remoteOptions : localMatches;
            } catch (error) {
                console.error(`${LOG_PREFIX} transfer picker search failed`, error);
                return localMatches;
            }
        };

        setPickerModal({
            visible: true,
            title: TRANSLATIONS.pickerDispatcher || 'Select dispatcher',
            options,
            value: '',
            onChange: async (targetId) => {
                const selectedOption = options.find((opt) => String(opt?.id) === String(targetId));
                await handleTransferDispatcher(order, selectedOption || targetId);
            },
            searchable: true,
            searchFields: ['label', 'full_name', 'phone', 'email', 'role'],
            searchPlaceholder: TRANSLATIONS.placeholderSearch || 'Search by name, phone, email',
            onSearch: searchTransferOptions,
            emptyText: TRANSLATIONS.noDispatchersFound || 'No dispatchers found',
        });
    };

    const handleTransferDispatcher = async (order, targetDispatcher) => {
        const targetDispatcherId = typeof targetDispatcher === 'object' ? targetDispatcher?.id : targetDispatcher;
        if (!order?.id || !user?.id || !targetDispatcherId) return;
        const targetId = String(targetDispatcherId);
        const knownTarget = [...(dispatchers || []), ...(adminUsers || [])]
            .find((person) => String(person?.id || '') === targetId);
        const fallbackName = `${TRANSLATIONS.pickerDispatcher || 'Dispatcher'} ${targetId.slice(0, 6)}`;
        const targetLabel = (typeof targetDispatcher === 'object'
            ? (
                targetDispatcher?.label
                || targetDispatcher?.full_name
                || targetDispatcher?.email
                || targetDispatcher?.phone
            )
            : null)
            || knownTarget?.full_name
            || knownTarget?.name
            || knownTarget?.email
            || knownTarget?.phone
            || fallbackName;
        const confirmTemplate = TRANSLATIONS.alertTransferMsg || 'Transfer this order to {0}?';
        const confirmMessage = String(confirmTemplate).includes('{0}')
            ? String(confirmTemplate).replace('{0}', targetLabel)
            : `${confirmTemplate}\n${targetLabel}`;
        const executeTransfer = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.transferOrderToDispatcher(order.id, user.id, targetId, user?.role);
                if (result.success) {
                    showToast?.(TRANSLATIONS.toastTransferSuccess || 'Order transferred', 'success');
                    setDetailsOrder(null);
                    markTabsDirty(['orders', 'analytics', 'people'], 'order_transfer_dispatcher');
                    loadOrders({ reason: 'order_transfer_dispatcher' });
                } else {
                    showToast?.(TRANSLATIONS.toastTransferFailed || 'Transfer failed', 'error');
                }
            } catch (e) {
                showToast?.(TRANSLATIONS.toastTransferFailed || 'Transfer failed', 'error');
            } finally {
                setActionLoading(false);
            }
        };
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (window.confirm(confirmMessage)) {
                await executeTransfer();
            }
            return;
        }
        Alert.alert(
            TRANSLATIONS.transferOrder || 'Transfer Order',
            confirmMessage,
            [
                { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
                { text: TRANSLATIONS.confirm || 'Confirm', onPress: () => { void executeTransfer(); } },
            ],
        );
    };

    const handleVerifyPaymentProof = async (orderId, isValid) => {
        setActionLoading(true);
        try {
            const result = await ordersService.verifyPaymentProof(orderId, isValid, isValid ? 'Approved by admin' : 'Rejected by admin');
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setDetailsOrder(null);
                markTabsDirty(['orders', 'analytics', 'people'], 'payment_proof_verify');
                loadOrders({ reason: 'payment_proof_verify' });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const closeBalanceModal = useCallback(() => {
        setShowBalanceModal(false);
        setBalanceData({ amount: '', type: 'top_up', notes: '' });
    }, []);

    const openMasterOverlayModal = useCallback((onOpen) => {
        if (typeof onOpen !== 'function') return;
        if (detailsPerson?.id) {
            setIsEditingPerson(false);
            setIsEditingMasterPerformance(false);
            setEditPersonPhoneError('');
            setDetailsPerson(null);
            setTimeout(() => {
                onOpen();
            }, Platform.OS === 'web' ? 40 : 180);
            return;
        }
        onOpen();
    }, [detailsPerson?.id]);

    const openMasterBalanceModal = useCallback((person, mode = 'top_up') => {
        if (!person?.id) return;
        const nextType = mode === 'adjustment' ? 'adjustment' : 'top_up';
        setIsEditingPerson(false);
        setEditPersonPhoneError('');
        openMasterOverlayModal(() => {
            setSelectedMaster(person);
            setBalanceData({ amount: '', type: nextType, notes: '' });
            setShowBalanceModal(true);
        });
    }, [openMasterOverlayModal]);

    const openMasterPerformanceEditor = useCallback((person) => {
        if (!person?.id) return;
        setIsEditingPerson(false);
        setEditPersonPhoneError('');
        setMasterPerformanceTarget(person);
        setMasterPerformanceData({
            max_active_jobs: person?.max_active_jobs === null || person?.max_active_jobs === undefined ? '' : String(person.max_active_jobs),
            max_immediate_orders: person?.max_immediate_orders === null || person?.max_immediate_orders === undefined ? '' : String(person.max_immediate_orders),
            max_pending_confirmation: person?.max_pending_confirmation === null || person?.max_pending_confirmation === undefined ? '' : String(person.max_pending_confirmation),
        });
        setIsEditingMasterPerformance(true);
    }, []);

    const closeMasterPerformanceEditor = useCallback(() => {
        setIsEditingMasterPerformance(false);
        setMasterPerformanceTarget(null);
        setMasterPerformanceData({
            max_active_jobs: '',
            max_immediate_orders: '',
            max_pending_confirmation: '',
        });
    }, []);

    const handleCancelPartnerTermsEditor = useCallback(() => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        const commissionPercent = Number(activePartner?.partner_commission_rate || 0) * 100;
        setPartnerCommissionInput(Number.isFinite(commissionPercent) ? String(commissionPercent) : '10');
        setPartnerMinPayoutInput(String(activePartner?.partner_min_payout ?? 50));
        setIsEditingPartnerTerms(false);
    }, [detailsPerson]);

    const handleCancelPartnerBalanceEditor = useCallback(() => {
        setIsEditingPartnerBalance(false);
        setPartnerBalanceActionType('top_up');
        setPartnerDeductAmount('');
        setPartnerDeductReason('');
    }, []);

    const handleOpenPartnerTermsEditor = useCallback(() => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        if (!activePartner?.id) return;
        const commissionPercent = Number(activePartner.partner_commission_rate || 0) * 100;
        setPartnerCommissionInput(Number.isFinite(commissionPercent) ? String(commissionPercent) : '10');
        setPartnerMinPayoutInput(String(activePartner.partner_min_payout ?? 50));
        setIsPartnerFinanceExpanded(true);
        setIsEditingPartnerBalance(false);
        setIsEditingPartnerTerms(true);
    }, [detailsPerson]);

    const handleOpenPartnerBalanceEditor = useCallback((mode = 'top_up') => {
        const activePartner = detailsPerson?.type === 'partner' ? detailsPerson : null;
        if (!activePartner?.id) return;
        setIsPartnerFinanceExpanded(true);
        setIsEditingPartnerTerms(false);
        setIsEditingPartnerBalance(true);
        setPartnerBalanceActionType(mode === 'deduct' ? 'deduct' : 'top_up');
        setPartnerDeductAmount('');
        setPartnerDeductReason('');
    }, [detailsPerson]);

    const handleCloseDetailsDrawer = useCallback(() => {
        if (isEditingPerson) {
            setIsEditingPerson(false);
            setEditPersonPhoneError('');
            return;
        }
        if (isEditingMasterPerformance) {
            closeMasterPerformanceEditor();
            return;
        }
        if (isEditingPartnerTerms) {
            handleCancelPartnerTermsEditor();
            return;
        }
        if (isEditingPartnerBalance) {
            handleCancelPartnerBalanceEditor();
            return;
        }
        setDetailsPerson(null);
    }, [
        closeMasterPerformanceEditor,
        handleCancelPartnerBalanceEditor,
        handleCancelPartnerTermsEditor,
        isEditingMasterPerformance,
        isEditingPartnerBalance,
        isEditingPartnerTerms,
        isEditingPerson,
    ]);

    useEffect(() => {
        if (
            detailsPerson?.type === 'master'
            && detailsPerson?.id
            && masterPerformanceTarget?.id
            && String(masterPerformanceTarget.id) === String(detailsPerson.id)
        ) {
            return;
        }
        closeMasterPerformanceEditor();
    }, [closeMasterPerformanceEditor, detailsPerson?.id, detailsPerson?.type, masterPerformanceTarget?.id]);

    const handleAddMasterBalance = async (masterId, amount, type, notes) => {
        const transactionType = type === 'adjustment' ? 'adjustment' : 'top_up';
        const parsedAmount = Number(String(amount || '').replace(',', '.'));
        if (!masterId) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            return;
        }
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            showToast(TRANSLATIONS.amountSom || 'Amount (som)', 'error');
            return;
        }
        const signedAmount = transactionType === 'adjustment'
            ? -Math.abs(parsedAmount)
            : Math.abs(parsedAmount);

        setActionLoading(true);
        try {
            const result = await earningsService.addMasterBalance(masterId, signedAmount, transactionType, notes);
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                closeBalanceModal();
                topUpHistoryCache.current.delete(`master:${masterId}`);
                setDetailsPerson((prev) => {
                    if (!prev || prev.id !== masterId) return prev;
                    const nextBalance = Number(result.balanceAfter);
                    return {
                        ...prev,
                        prepaid_balance: Number.isFinite(nextBalance) ? nextBalance : prev.prepaid_balance,
                    };
                });
                setSelectedMaster((prev) => {
                    if (!prev || prev.id !== masterId) return prev;
                    const nextBalance = Number(result.balanceAfter);
                    return {
                        ...prev,
                        prepaid_balance: Number.isFinite(nextBalance) ? nextBalance : prev.prepaid_balance,
                    };
                });
                markTabsDirty(['people', 'analytics'], transactionType === 'adjustment' ? 'master_balance_deduct' : 'master_balance_topup');
                loadMasters({ force: true });
                loadCommissionData();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleSetInitialDeposit = async (masterId, amount) => {
        setActionLoading(true);
        try {
            const result = await authService.setMasterInitialDeposit(masterId, parseFloat(amount));
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setShowDepositModal(false);
                markTabsDirty(['people', 'analytics'], 'master_initial_deposit');
                loadMasters({ force: true });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };
    // ----------------------

    const parseOptionalNonNegativeInteger = useCallback((value, label) => {
        const raw = String(value ?? '').trim();
        if (!raw) return { ok: true, value: null };
        if (!/^\d+$/.test(raw)) {
            return { ok: false, value: null, error: `${label} must be a non-negative whole number` };
        }
        return { ok: true, value: Number.parseInt(raw, 10) };
    }, []);

    const parseOptionalNonNegativeDecimal = useCallback((value, label) => {
        const raw = String(value ?? '').trim();
        if (!raw) return { ok: true, value: null };
        const parsed = Number(raw.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) {
            return { ok: false, value: null, error: `${label} must be a non-negative number` };
        }
        return { ok: true, value: parsed };
    }, []);

    const handleSaveMasterPerformance = async () => {
        if (!masterPerformanceTarget?.id) return;

        const maxActiveParsed = parseOptionalNonNegativeInteger(masterPerformanceData?.max_active_jobs, TRANSLATIONS.maxActiveJobs || 'Max active jobs');
        if (!maxActiveParsed.ok) {
            showToast(maxActiveParsed.error, 'error');
            return;
        }

        const maxImmediateParsed = parseOptionalNonNegativeInteger(masterPerformanceData?.max_immediate_orders, TRANSLATIONS.maxImmediateOrders || 'Max immediate orders');
        if (!maxImmediateParsed.ok) {
            showToast(maxImmediateParsed.error, 'error');
            return;
        }

        const maxPendingParsed = parseOptionalNonNegativeInteger(masterPerformanceData?.max_pending_confirmation, TRANSLATIONS.maxPendingConfirmation || 'Max pending confirmation');
        if (!maxPendingParsed.ok) {
            showToast(maxPendingParsed.error, 'error');
            return;
        }

        const updates = {
            max_active_jobs: maxActiveParsed.value,
            max_immediate_orders: maxImmediateParsed.value,
            max_pending_confirmation: maxPendingParsed.value,
        };

        setActionLoading(true);
        try {
            const result = await authService.updateProfile(masterPerformanceTarget.id, updates);
            if (!result?.success) {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (result?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
                return;
            }
            const updatedProfile = result?.user || {};
            setDetailsPerson((prev) => {
                if (!prev || prev.id !== masterPerformanceTarget.id) return prev;
                return {
                    ...prev,
                    max_active_jobs: updatedProfile.max_active_jobs ?? updates.max_active_jobs,
                    max_immediate_orders: updatedProfile.max_immediate_orders ?? updates.max_immediate_orders,
                    max_pending_confirmation: updatedProfile.max_pending_confirmation ?? updates.max_pending_confirmation,
                };
            });
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
            closeMasterPerformanceEditor();
            markTabsDirty(['people', 'analytics', 'orders'], 'master_performance_update');
            loadMasters({ force: true });
        } catch (error) {
            console.error('Master performance update failed:', error);
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const closeAddUserModal = useCallback(() => {
        setShowAddUserModal(false);
        setNewUserData(createEmptyNewUserData());
        setNewUserPhoneError('');
    }, []);

    const handleNewUserPhoneChange = useCallback((text) => {
        const rawValue = String(text || '');
        const normalized = normalizeKyrgyzPhone(rawValue);
        const nextValue = normalized || rawValue;
        setNewUserData((prev) => ({ ...prev, phone: nextValue }));
        setNewUserPhoneError(nextValue && !isValidKyrgyzPhone(nextValue)
            ? (TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)')
            : '');
    }, [TRANSLATIONS.errorPhoneFormat]);

    const handleNewUserPhoneBlur = useCallback(() => {
        const rawValue = String(newUserData?.phone || '').trim();
        if (!rawValue) {
            setNewUserPhoneError('');
            return;
        }
        const normalized = normalizeKyrgyzPhone(rawValue);
        if (!normalized) {
            setNewUserPhoneError(TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)');
            return;
        }
        setNewUserData((prev) => ({ ...prev, phone: normalized }));
        setNewUserPhoneError('');
    }, [newUserData?.phone, TRANSLATIONS.errorPhoneFormat]);

    const handleEditPersonPhoneChange = useCallback((text) => {
        const rawValue = String(text || '');
        const normalized = normalizeKyrgyzPhone(rawValue);
        const nextValue = normalized || rawValue;
        setEditPersonData((prev) => ({ ...prev, phone: nextValue }));
        setEditPersonPhoneError(nextValue && !isValidKyrgyzPhone(nextValue)
            ? (TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)')
            : '');
    }, [TRANSLATIONS.errorPhoneFormat]);

    const handleEditPersonPhoneBlur = useCallback(() => {
        const rawValue = String(editPersonData?.phone || '').trim();
        if (!rawValue) {
            setEditPersonPhoneError('');
            return;
        }
        const normalized = normalizeKyrgyzPhone(rawValue);
        if (!normalized) {
            setEditPersonPhoneError(TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)');
            return;
        }
        setEditPersonData((prev) => ({ ...prev, phone: normalized }));
        setEditPersonPhoneError('');
    }, [editPersonData?.phone, TRANSLATIONS.errorPhoneFormat]);

    // Handle save person profile
    const handleSavePersonProfile = async () => {
        const fullName = String(editPersonData?.full_name || '').trim();
        const email = String(editPersonData?.email || '').trim().toLowerCase();
        const rawPhone = String(editPersonData?.phone || '').trim();
        const normalizedPhone = rawPhone ? normalizeKyrgyzPhone(rawPhone) : '';

        if (!fullName) {
            showToast(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error');
            return;
        }

        if (email && !EMAIL_FORMAT_REGEX.test(email)) {
            showToast(TRANSLATIONS.invalidEmail || 'Invalid email format', 'error');
            return;
        }

        if (rawPhone && !normalizedPhone) {
            setEditPersonPhoneError(TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)');
            showToast(TRANSLATIONS.toastFixPhone || 'Fix phone format', 'error');
            return;
        }

        const maxActiveParsed = parseOptionalNonNegativeInteger(editPersonData?.max_active_jobs, TRANSLATIONS.maxActiveJobs || 'Max active jobs');
        if (detailsPerson?.type === 'master' && !maxActiveParsed.ok) {
            showToast(maxActiveParsed.error, 'error');
            return;
        }

        const maxImmediateParsed = parseOptionalNonNegativeInteger(editPersonData?.max_immediate_orders, TRANSLATIONS.maxImmediateOrders || 'Max immediate orders');
        if (detailsPerson?.type === 'master' && !maxImmediateParsed.ok) {
            showToast(maxImmediateParsed.error, 'error');
            return;
        }

        const maxPendingParsed = parseOptionalNonNegativeInteger(editPersonData?.max_pending_confirmation, TRANSLATIONS.maxPendingConfirmation || 'Max pending confirmation');
        if (detailsPerson?.type === 'master' && !maxPendingParsed.ok) {
            showToast(maxPendingParsed.error, 'error');
            return;
        }

        setActionLoading(true);
        try {
            const updates = {
                full_name: fullName,
                phone: normalizedPhone || '',
                email,
            };

            if (detailsPerson?.type === 'master') {
                updates.service_area = String(editPersonData?.service_area || '').trim();
                updates.max_active_jobs = maxActiveParsed.value;
                updates.max_immediate_orders = maxImmediateParsed.value;
                updates.max_pending_confirmation = maxPendingParsed.value;
            }

            const result = await authService.updateProfile(detailsPerson?.id, updates);

            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setIsEditingPerson(false);
                setEditPersonPhoneError('');
                setDetailsPerson(null);
                markTabsDirty(['people', 'analytics', 'orders'], 'person_profile_update');
                if (detailsPerson?.type === 'master') loadMasters({ force: true });
                else if (detailsPerson?.type === 'partner') loadPartners({ force: true });
                else loadDispatchers({ force: true });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) {
            console.error('Profile update failed:', e);
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        }
        finally { setActionLoading(false); }
    };

    // Handle create new user (master/dispatcher/partner)
    const handleCreateUser = async () => {
        const email = String(newUserData?.email || '').trim().toLowerCase();
        const password = String(newUserData?.password || '');
        const fullName = String(newUserData?.full_name || '').trim();
        const rawPhone = String(newUserData?.phone || '').trim();
        const normalizedPhone = rawPhone ? normalizeKyrgyzPhone(rawPhone) : '';
        const serviceArea = String(newUserData?.service_area || '').trim();

        if (!email || !password || !fullName) {
            showToast(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error');
            return;
        }

        if (!EMAIL_FORMAT_REGEX.test(email)) {
            showToast(TRANSLATIONS.invalidEmail || 'Invalid email format', 'error');
            return;
        }

        if (password.length < 6) {
            showToast(TRANSLATIONS.minCharacters || 'Minimum 6 characters', 'error');
            return;
        }

        if (rawPhone && !normalizedPhone) {
            setNewUserPhoneError(TRANSLATIONS.errorPhoneFormat || 'Invalid format (+996...)');
            showToast(TRANSLATIONS.toastFixPhone || 'Fix phone format', 'error');
            return;
        }

        const maxActiveParsed = parseOptionalNonNegativeInteger(newUserData?.max_active_jobs, TRANSLATIONS.maxActiveJobs || 'Max active jobs');
        if (addUserRole === 'master' && !maxActiveParsed.ok) {
            showToast(maxActiveParsed.error, 'error');
            return;
        }

        const maxImmediateParsed = parseOptionalNonNegativeInteger(newUserData?.max_immediate_orders, TRANSLATIONS.maxImmediateOrders || 'Max immediate orders');
        if (addUserRole === 'master' && !maxImmediateParsed.ok) {
            showToast(maxImmediateParsed.error, 'error');
            return;
        }

        const maxPendingParsed = parseOptionalNonNegativeInteger(newUserData?.max_pending_confirmation, TRANSLATIONS.maxPendingConfirmation || 'Max pending confirmation');
        if (addUserRole === 'master' && !maxPendingParsed.ok) {
            showToast(maxPendingParsed.error, 'error');
            return;
        }

        const partnerCommissionParsed = parseOptionalNonNegativeDecimal(newUserData?.partner_commission_rate, TRANSLATIONS.commissionRate || 'Commission');
        if (addUserRole === 'partner' && (!partnerCommissionParsed.ok || (partnerCommissionParsed.value !== null && partnerCommissionParsed.value > 100))) {
            showToast(partnerCommissionParsed.error || (TRANSLATIONS.errorGeneric || 'Commission must be between 0 and 100'), 'error');
            return;
        }

        const partnerMinPayoutParsed = parseOptionalNonNegativeDecimal(newUserData?.partner_min_payout, TRANSLATIONS.partnerMinPayout || 'Min payout');
        if (addUserRole === 'partner' && !partnerMinPayoutParsed.ok) {
            showToast(partnerMinPayoutParsed.error, 'error');
            return;
        }

        const createPayload = {
            ...newUserData,
            email,
            password,
            full_name: fullName,
            phone: normalizedPhone || '',
            service_area: serviceArea,
            role: addUserRole,
        };

        if (addUserRole === 'master') {
            if (String(newUserData?.max_active_jobs ?? '').trim() !== '') createPayload.max_active_jobs = maxActiveParsed.value;
            if (String(newUserData?.max_immediate_orders ?? '').trim() !== '') createPayload.max_immediate_orders = maxImmediateParsed.value;
            if (String(newUserData?.max_pending_confirmation ?? '').trim() !== '') createPayload.max_pending_confirmation = maxPendingParsed.value;
        }

        if (addUserRole === 'partner') {
            createPayload.partner_commission_rate = partnerCommissionParsed.value ?? null;
            createPayload.partner_min_payout = partnerMinPayoutParsed.value ?? null;
        }

        setActionLoading(true);
        try {
            const result = await authService.createUser(
                createPayload,
                {
                    creatorRole: user?.role || authUser?.role || 'admin',
                }
            );

            if (result.success) {
                showToast(result.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
                closeAddUserModal();
                markTabsDirty(['people', 'analytics', 'orders'], 'user_create');
                if (addUserRole === 'master') loadMasters({ force: true });
                else if (addUserRole === 'partner') loadPartners({ force: true });
                else loadDispatchers({ force: true });
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (result?.message || TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) {
            console.error('Create user failed:', e);
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        }
        finally { setActionLoading(false); }
    };

    // Handle password reset for master/dispatcher
    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            showToast(TRANSLATIONS.minCharacters || 'Minimum 6 characters', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast(TRANSLATIONS.passwordsNotMatch || 'Passwords do not match', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await authService.resetUserPassword(passwordResetTarget?.id, newPassword);

            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setShowPasswordResetModal(false);
                setPasswordResetTarget(null);
                setNewPassword('');
                setConfirmPassword('');
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) {
            console.error('Password reset failed:', e);
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        }
        finally { setActionLoading(false); }
    };

    const handleDeleteUser = async (person, explicitRole = null) => {
        const targetId = person?.id;
        if (!targetId) return;

        const role = String(explicitRole || person?.type || person?.role || '').toLowerCase();
        const roleLabel = role === 'master'
            ? (TRANSLATIONS.masterRole || 'Master')
            : role === 'partner'
                ? (TRANSLATIONS.partnerRole || 'Partner')
                : (TRANSLATIONS.dispatcherRole || 'Dispatcher');
        const displayName = person?.full_name || person?.email || person?.phone || String(targetId).slice(0, 8);
        const deleteTitle = TRANSLATIONS.deleteUser || TRANSLATIONS.delete || 'Delete User';
        const deleteMessage = `${TRANSLATIONS.confirmDeleteUser || 'Permanently delete this user? This cannot be undone.'}\n\n${roleLabel}: ${displayName}`;

        confirmDestructive(deleteTitle, deleteMessage, async () => {
            setActionLoading(true);
            try {
                const result = await authService.hardDeleteUser(
                    targetId,
                    `admin_panel_delete:${role || 'user'}`
                );

                if (!result?.success) {
                    const blockers = result?.blockers || {};
                    const blockerSuffix = (Number(blockers.reviews || 0) > 0 || Number(blockers.disputes || 0) > 0)
                        ? ` (reviews: ${Number(blockers.reviews || 0)}, disputes: ${Number(blockers.disputes || 0)})`
                        : '';
                    showToast(
                        (TRANSLATIONS.toastFailedPrefix || 'Failed: ')
                        + (result?.message || TRANSLATIONS.errorGeneric || 'Error')
                        + blockerSuffix,
                        'error'
                    );
                    return;
                }

                showToast(result.message || (TRANSLATIONS.toastUpdated || 'Updated'), 'success');
                setIsEditingPerson(false);
                if (detailsPerson?.id && String(detailsPerson.id) === String(targetId)) {
                    setDetailsPerson(null);
                }
                if (passwordResetTarget?.id && String(passwordResetTarget.id) === String(targetId)) {
                    setShowPasswordResetModal(false);
                    setPasswordResetTarget(null);
                    setNewPassword('');
                    setConfirmPassword('');
                }

                markTabsDirty(['people', 'analytics', 'orders'], 'user_delete');
                if (role === 'master') {
                    await loadMasters({ force: true });
                } else if (role === 'partner') {
                    await loadPartners({ force: true });
                } else if (role === 'dispatcher') {
                    await loadDispatchers({ force: true });
                } else {
                    await Promise.all([
                        loadMasters({ force: true }),
                        loadPartners({ force: true }),
                        loadDispatchers({ force: true }),
                    ]);
                }
            } catch (error) {
                showToast(
                    (TRANSLATIONS.toastFailedPrefix || 'Failed: ')
                    + (error?.message || TRANSLATIONS.errorGeneric || 'Error'),
                    'error'
                );
            } finally {
                setActionLoading(false);
            }
        });
    };

    // Load order history when modal opens (works for both masters and dispatchers)
    const loadOrderHistory = async (person, force = false) => {
        if (!person?.id) return;
        const cacheKey = `${person?.type || person?.role || 'person'}:${person.id}`;

        if (!force && orderHistoryCache.current.has(cacheKey)) {
            setMasterOrderHistory(orderHistoryCache.current.get(cacheKey));
            return;
        }

        if (orderHistoryLoading) return;

        setOrderHistoryLoading(true);
        try {
            let history;
            if (
                person?.type === 'dispatcher'
                || person?.role === 'dispatcher'
                || person?.type === 'partner'
                || person?.role === 'partner'
            ) {
                // Get orders created/handled by this dispatcher
                history = await ordersService.getDispatcherOrderHistory(person.id);
            } else {
                // Get orders related to this master
                history = await ordersService.getMasterOrderHistory(person.id);
            }
            const safeHistory = history || [];
            orderHistoryCache.current.set(cacheKey, safeHistory);
            setMasterOrderHistory(safeHistory);
        } catch (e) {
            console.error('Failed to load order history:', e);
            setMasterOrderHistory([]);
        } finally {
            setOrderHistoryLoading(false);
        }
    };

    const openOrderHistory = async (person) => {
        if (!person?.id) return;
        setSelectedMaster(person);
        setMasterOrderHistory([]);
        setShowOrderHistoryModal(true);
        await loadOrderHistory(person, true);
    };

    const closeOrderHistoryModal = useCallback(() => {
        setShowOrderHistoryModal(false);
    }, []);

    useEffect(() => {
        if (showOrderHistoryModal && selectedMaster?.id && masterOrderHistory.length === 0) {
            loadOrderHistory(selectedMaster);
        }
    }, [showOrderHistoryModal, selectedMaster, masterOrderHistory.length]);

    const loadTopUpHistory = async (person, force = false) => {
        if (!person?.id) return;
        if (person?.type !== 'master' && person?.role !== 'master') return;
        const cacheKey = `master:${person.id}`;

        if (!force && topUpHistoryCache.current.has(cacheKey)) {
            setTopUpHistory(topUpHistoryCache.current.get(cacheKey));
            return;
        }

        if (topUpHistoryLoading) return;

        setTopUpHistoryLoading(true);
        try {
            const history = await earningsService.getBalanceTransactions(person.id, 50);
            const filtered = (history || []).filter(tx => ['top_up', 'initial_deposit', 'adjustment'].includes(tx.transaction_type));
            topUpHistoryCache.current.set(cacheKey, filtered);
            setTopUpHistory(filtered);
        } catch (e) {
            console.error('Failed to load top-up history:', e);
            setTopUpHistory([]);
        } finally {
            setTopUpHistoryLoading(false);
        }
    };

    const openTopUpHistory = async (person) => {
        if (!person?.id) return;
        setSelectedMaster(person);
        setTopUpHistory([]);
        setShowTopUpHistoryModal(true);
        await loadTopUpHistory(person, true);
    };

    const closeTopUpHistoryModal = useCallback(() => {
        setShowTopUpHistoryModal(false);
    }, []);

    const openPartnerHistoryModal = useCallback(() => {
        setShowPartnerHistoryModal(true);
    }, []);

    const closePartnerHistoryModal = useCallback(() => {
        setShowPartnerHistoryModal(false);
        setPartnerHistorySearchQuery('');
    }, []);

    useEffect(() => {
        if (showTopUpHistoryModal && selectedMaster?.id && topUpHistory.length === 0) {
            loadTopUpHistory(selectedMaster);
        }
    }, [showTopUpHistoryModal, selectedMaster, topUpHistory.length]);

    const normalizePartnerFinanceSummary = useCallback((summary) => {
        const fallback = createEmptyPartnerFinanceSummary();
        const source = summary && typeof summary === 'object' ? summary : {};
        return {
            ...fallback,
            ...source,
            balance: Number(source.balance ?? fallback.balance),
            commissionRatePercent: Number(source.commissionRatePercent ?? fallback.commissionRatePercent),
            minPayout: Number(source.minPayout ?? fallback.minPayout),
            earnedTotal: Number(source.earnedTotal ?? fallback.earnedTotal),
            deductedTotal: Number(source.deductedTotal ?? fallback.deductedTotal),
            paidTotal: Number(source.paidTotal ?? fallback.paidTotal),
            requestedTotal: Number(source.requestedTotal ?? fallback.requestedTotal),
            pendingRequests: Number(source.pendingRequests ?? fallback.pendingRequests),
            transactions: Array.isArray(source.transactions) ? source.transactions : [],
            payoutRequests: Array.isArray(source.payoutRequests) ? source.payoutRequests : [],
        };
    }, []);

    const loadPartnerFinanceSummary = useCallback(async (partner, force = false) => {
        if (!partner?.id) return createEmptyPartnerFinanceSummary();
        const cacheKey = `partner:${partner.id}`;

        if (!force && partnerFinanceCache.current.has(cacheKey)) {
            const cached = partnerFinanceCache.current.get(cacheKey);
            setPartnerFinanceSummary(cached);
            return cached;
        }

        if (partnerFinanceLoading && !force) return partnerFinanceSummary;

        setPartnerFinanceLoading(true);
        try {
            const summary = await partnerFinanceService.getPartnerFinanceSummary(partner.id);
            const normalized = normalizePartnerFinanceSummary(summary);
            partnerFinanceCache.current.set(cacheKey, normalized);
            setPartnerFinanceSummary(normalized);
            setPartnerPayoutRequests(normalized.payoutRequests || []);
            return normalized;
        } catch (error) {
            console.error('Failed to load partner finance summary:', error);
            const fallback = createEmptyPartnerFinanceSummary();
            setPartnerFinanceSummary(fallback);
            return fallback;
        } finally {
            setPartnerFinanceLoading(false);
        }
    }, [normalizePartnerFinanceSummary, partnerFinanceLoading, partnerFinanceSummary]);

    useEffect(() => {
        if (detailsPerson?.type !== 'partner' || !detailsPerson?.id || !isPartnerFinanceExpanded) return;
        void loadPartnerFinanceSummary(detailsPerson);
    }, [detailsPerson, isPartnerFinanceExpanded, loadPartnerFinanceSummary]);

    const formatDateTimeLabel = useCallback((value) => {
        if (!value) return TRANSLATIONS.noData || 'N/A';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return TRANSLATIONS.noData || 'N/A';
        return date.toLocaleString();
    }, [TRANSLATIONS.noData]);

    const buildPersonCurrentActivity = useCallback((personType, personId) => {
        if (!personType || !personId) return null;
        const targetId = String(personId);
        const relatedOrders = (orders || []).filter((orderItem) => {
            const masterId = String(orderItem?.master_id || orderItem?.master?.id || '');
            const dispatcherId = String(orderItem?.dispatcher_id || orderItem?.dispatcher?.id || '');
            const assignedDispatcherId = String(orderItem?.assigned_dispatcher_id || orderItem?.assigned_dispatcher?.id || '');
            if (personType === 'master') return masterId === targetId;
            if (personType === 'dispatcher' || personType === 'partner') {
                return dispatcherId === targetId || assignedDispatcherId === targetId;
            }
            return false;
        });

        const activeCount = relatedOrders.filter((orderItem) => {
            const status = normalizeStatus(orderItem?.status);
            if (personType === 'master') return ['claimed', 'started', 'wip'].includes(status);
            return !COMPLETED_STATUSES.has(status) && !CANCELED_STATUSES.has(status) && status !== 'reopened';
        }).length;
        const awaitingPaymentCount = relatedOrders.filter((orderItem) => normalizeStatus(orderItem?.status) === 'completed').length;
        const reopenedCount = relatedOrders.filter((orderItem) => normalizeStatus(orderItem?.status) === 'reopened').length;
        const latestOrder = [...relatedOrders].sort((a, b) => {
            const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
            const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
            return bTime - aTime;
        })[0];
        const latestStatusLabel = latestOrder
            ? getOrderStatusLabel(latestOrder?.status, TRANSLATIONS)
            : (TRANSLATIONS.noData || 'N/A');
        const latestAtLabel = latestOrder
            ? formatDateTimeLabel(latestOrder?.updated_at || latestOrder?.created_at)
            : (TRANSLATIONS.noData || 'N/A');
        const stateLabel = activeCount > 0
            ? `${TRANSLATIONS.active || 'Active'} (${activeCount})`
            : (TRANSLATIONS.available || 'Available');

        return {
            activeCount,
            awaitingPaymentCount,
            reopenedCount,
            latestStatusLabel,
            latestAtLabel,
            stateLabel,
            relatedCount: relatedOrders.length,
        };
    }, [orders, TRANSLATIONS, formatDateTimeLabel]);

    const masterCurrentActivity = useMemo(() => (
        detailsPerson?.type === 'master' && detailsPerson?.id
            ? buildPersonCurrentActivity('master', detailsPerson.id)
            : null
    ), [detailsPerson?.id, detailsPerson?.type, buildPersonCurrentActivity]);

    const dispatcherCurrentActivity = useMemo(() => (
        detailsPerson?.type === 'dispatcher' && detailsPerson?.id
            ? buildPersonCurrentActivity('dispatcher', detailsPerson.id)
            : null
    ), [detailsPerson?.id, detailsPerson?.type, buildPersonCurrentActivity]);

    const partnerCurrentActivity = useMemo(() => (
        detailsPerson?.type === 'partner' && detailsPerson?.id
            ? buildPersonCurrentActivity('partner', detailsPerson.id)
            : null
    ), [detailsPerson?.id, detailsPerson?.type, buildPersonCurrentActivity]);

    const partnerPendingRequestsCount = useMemo(() => (
        (partnerPayoutRequests || []).filter((item) => String(item?.status || '').toLowerCase() === 'requested').length
    ), [partnerPayoutRequests]);

    const partnerFinanceCurrentRequest = useMemo(() => (
        (partnerFinanceSummary?.payoutRequests || []).find((item) => String(item?.status || '').toLowerCase() === 'requested') || null
    ), [partnerFinanceSummary]);

    const partnerHistoryRequests = useMemo(() => (
        Array.isArray(partnerFinanceSummary?.payoutRequests) ? partnerFinanceSummary.payoutRequests : []
    ), [partnerFinanceSummary?.payoutRequests]);

    const partnerHistoryTransactions = useMemo(() => (
        Array.isArray(partnerFinanceSummary?.transactions) ? partnerFinanceSummary.transactions : []
    ), [partnerFinanceSummary?.transactions]);

    const partnerHistorySearchNormalized = normalizeSearchTerm(partnerHistorySearchQuery);
    const filteredPartnerHistoryRequests = useMemo(() => {
        if (!partnerHistorySearchNormalized) return partnerHistoryRequests;
        return partnerHistoryRequests.filter((item) => {
            const haystack = [
                item?.status,
                item?.requested_amount,
                item?.approved_amount,
                item?.requested_note,
                item?.admin_note,
                item?.created_at,
                item?.processed_at,
            ].map((v) => String(v ?? '').toLowerCase()).join(' ');
            return haystack.includes(partnerHistorySearchNormalized);
        });
    }, [partnerHistoryRequests, partnerHistorySearchNormalized]);
    const filteredPartnerHistoryTransactions = useMemo(() => {
        if (!partnerHistorySearchNormalized) return partnerHistoryTransactions;
        return partnerHistoryTransactions.filter((item) => {
            const haystack = [
                item?.transaction_type,
                item?.amount,
                item?.notes,
                item?.created_at,
                item?.balance_before,
                item?.balance_after,
            ].map((v) => String(v ?? '').toLowerCase()).join(' ');
            return haystack.includes(partnerHistorySearchNormalized);
        });
    }, [partnerHistoryTransactions, partnerHistorySearchNormalized]);

    const shouldShowPartnerRequests = partnerHistoryFilter === 'all' || partnerHistoryFilter === 'requests';
    const shouldShowPartnerTransactions = partnerHistoryFilter === 'all' || partnerHistoryFilter === 'transactions';
    const isPersonSubSidebarOpen = showOrderHistoryModal || showTopUpHistoryModal || showPartnerHistoryModal;

    useEffect(() => {
        setPartnerHistoryRequestsLimit(PARTNER_HISTORY_PAGE_SIZE);
        setPartnerHistoryTransactionsLimit(PARTNER_HISTORY_PAGE_SIZE);
    }, [partnerHistoryFilter, partnerHistorySearchNormalized]);

    const platformDefaultLimits = useMemo(() => {
        const toPositiveInt = (value, fallback) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
        };
        return {
            maxActiveJobs: toPositiveInt(settings?.default_max_active_jobs, 2),
            maxImmediateOrders: toPositiveInt(settings?.default_max_immediate_orders, 1),
            maxPendingConfirmation: toPositiveInt(settings?.default_max_pending_confirmation, 3),
        };
    }, [
        settings?.default_max_active_jobs,
        settings?.default_max_immediate_orders,
        settings?.default_max_pending_confirmation,
    ]);

    const getPlatformDefaultPlaceholder = useCallback((value) => {
        const base = TRANSLATIONS.usePlatformDefault || 'Leave empty for platform default';
        return `${base} (${value})`;
    }, [TRANSLATIONS.usePlatformDefault]);

    const clearAnalyticsTooltipTimer = useCallback(() => {
        if (analyticsTooltipTimer.current) {
            clearTimeout(analyticsTooltipTimer.current);
            analyticsTooltipTimer.current = null;
        }
    }, []);

    const showAnalyticsTooltip = useCallback((payload, resetTimer = true) => {
        if (!payload?.text) return;
        setAnalyticsTooltip(payload);
        if (resetTimer && Platform.OS !== 'web') {
            clearAnalyticsTooltipTimer();
            analyticsTooltipTimer.current = setTimeout(() => {
                setAnalyticsTooltip(null);
            }, 2200);
        }
    }, [clearAnalyticsTooltipTimer]);

    const updateAnalyticsTooltipPos = useCallback((x, y) => {
        setAnalyticsTooltip(prev => (prev ? { ...prev, x, y } : prev));
    }, []);

    const hideAnalyticsTooltip = useCallback(() => {
        clearAnalyticsTooltipTimer();
        setAnalyticsTooltip(null);
    }, [clearAnalyticsTooltipTimer]);

    const clearAnalyticsTrendTooltipTimer = useCallback(() => {
        if (analyticsTrendTooltipTimer.current) {
            clearTimeout(analyticsTrendTooltipTimer.current);
            analyticsTrendTooltipTimer.current = null;
        }
    }, []);

    const showAnalyticsTrendTooltip = useCallback((payload, resetTimer = true) => {
        if (!payload?.title) return;
        setAnalyticsTrendTooltip(payload);
        if (resetTimer && Platform.OS !== 'web') {
            clearAnalyticsTrendTooltipTimer();
            analyticsTrendTooltipTimer.current = setTimeout(() => {
                setAnalyticsTrendTooltip(null);
            }, 2200);
        }
    }, [clearAnalyticsTrendTooltipTimer]);

    const updateAnalyticsTrendTooltipPos = useCallback((x, y) => {
        setAnalyticsTrendTooltip(prev => (prev ? { ...prev, x, y } : prev));
    }, []);

    const hideAnalyticsTrendTooltip = useCallback(() => {
        clearAnalyticsTrendTooltipTimer();
        setAnalyticsTrendTooltip(null);
    }, [clearAnalyticsTrendTooltipTimer]);

    const showPriceDistTooltip = useCallback((payload) => {
        if (!payload) return;
        setPriceDistTooltip(payload);
    }, []);

    const updatePriceDistTooltipPos = useCallback((x, y) => {
        setPriceDistTooltip(prev => (prev ? { ...prev, x, y } : prev));
    }, []);

    const hidePriceDistTooltip = useCallback(() => {
        setPriceDistTooltip(null);
    }, []);

    const analyticsInfoHandlers = useMemo(() => ({
        onShow: showAnalyticsTooltip,
        onMove: updateAnalyticsTooltipPos,
        onHide: hideAnalyticsTooltip,
    }), [showAnalyticsTooltip, updateAnalyticsTooltipPos, hideAnalyticsTooltip]);

    // ============================================
    // RENDERERS
    // ============================================

    const payoutStatusCounts = useMemo(() => {
        return (adminPayoutRequests || []).reduce((acc, item) => {
            const key = String(item?.status || 'requested').toLowerCase();
            acc.all += 1;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, { all: 0, requested: 0, paid: 0, rejected: 0, canceled: 0 });
    }, [adminPayoutRequests]);
    const pendingPayoutRequestsCount = useMemo(
        () => Number(payoutStatusCounts?.requested || 0),
        [payoutStatusCounts]
    );
    const filteredPayoutRequests = useMemo(() => {
        const statusFilter = String(adminPayoutStatusFilter || 'requested').toLowerCase();
        const needle = normalizeSearchTerm(searchQuery);
        const needleDigits = normalizeSearchDigits(searchQuery);
        return (adminPayoutRequests || []).filter((item) => {
            const status = String(item?.status || 'requested').toLowerCase();
            if (statusFilter !== 'all' && status !== statusFilter) {
                return false;
            }
            if (!needle && !needleDigits) return true;
            const partner = item?.partner || {};
            const searchFields = [
                partner?.full_name,
                partner?.email,
                partner?.phone,
                item?.requested_note,
                item?.admin_note,
                item?.requested_amount,
                item?.approved_amount,
                item?.id,
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            if (needle && searchFields.includes(needle)) return true;
            if (!needleDigits) return false;
            return normalizeSearchDigits(partner?.phone || '').includes(needleDigits);
        });
    }, [adminPayoutRequests, adminPayoutStatusFilter, searchQuery]);

    const menuItems = useMemo(() => buildAdminMenuItems(TRANSLATIONS), [TRANSLATIONS]);
    const activeDisputes = useMemo(
        () => (disputes || []).filter((item) => {
            const disputeStatus = String(item?.status || 'open').toLowerCase();
            if (!['open', 'in_review'].includes(disputeStatus)) return false;
            const orderStatus = normalizeStatus(item?.order?.status || '');
            if (orderStatus === 'confirmed') return false;
            if (item?.order && item.order.is_disputed === false) return false;
            return true;
        }),
        [disputes]
    );
    const openDisputesCount = useMemo(() => activeDisputes.length, [activeDisputes]);

    // Hamburger Sidebar (Modal-based like Dispatcher)
    const renderSidebar = () => (
        <Modal visible={isSidebarOpen} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
                {/* Sidebar Container */}
                <Animated.View style={[styles.sidebarContainer, !isDark && styles.sidebarContainerLight]}>
                    {/* Sidebar Header */}
                    <View style={[styles.sidebarHeader, !isDark && styles.sidebarHeaderLight]}>
                        <View style={styles.sidebarBrand}>
                            <Image source={require('../../assets/circle.png')} style={styles.sidebarBrandLogo} />
                            <Text style={[styles.sidebarTitle, !isDark && styles.textDark]}>{TRANSLATIONS.adminTitle || 'Admin Pro'}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.sidebarClose}>
                            <Ionicons name="close" size={20} color={isDark ? '#cbd5e1' : '#0f172a'} />
                        </TouchableOpacity>
                    </View>

                    {/* Sidebar Navigation */}
                    <View style={styles.sidebarNav}>
                        {/* Main Navigation */}
                        {menuItems.map(item => {
                            const isActive = activeTab === item.key;
                            const label = item.label;
                            return (
                                <TouchableOpacity
                                    key={item.key}
                                    style={[styles.sidebarNavItem, isActive && styles.sidebarNavItemActive]}
                                    onPress={async () => {
                                        setIsSidebarOpen(false);
                                        if (isActive) {
                                            await ensureTabData(item.key, { force: true, reason: 'tab_reselect' });
                                            return;
                                        }
                                        setActiveTab(item.key);
                                    }}
                                >
                                    <View style={styles.sidebarNavRow}>
                                        <Text style={[styles.sidebarNavText, isActive && styles.sidebarNavTextActive]}>
                                            {label}
                                        </Text>
                                        {item.key === 'orders' && needsActionCount > 0 && (
                                            <View style={styles.sidebarBadge}>
                                                <Text style={styles.sidebarBadgeText}>{needsActionCount}</Text>
                                            </View>
                                        )}
                                        {item.key === 'disputes' && openDisputesCount > 0 && (
                                            <View style={styles.sidebarBadge}>
                                                <Text style={styles.sidebarBadgeText}>{openDisputesCount}</Text>
                                            </View>
                                        )}
                                        {item.key === 'payouts' && pendingPayoutRequestsCount > 0 && (
                                            <View style={styles.sidebarBadge}>
                                                <Text style={styles.sidebarBadgeText}>{pendingPayoutRequestsCount}</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Sidebar Footer */}
                    <View style={[styles.sidebarFooter, !isDark && styles.sidebarFooterLight]}>
                        {/* Theme & Language Row */}
                        <View style={styles.sidebarButtonRow}>
                            <TouchableOpacity style={[styles.sidebarSmallBtn, !isDark && styles.sidebarBtnLight]} onPress={() => setIsDark(!isDark)}>
                                <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={isDark ? '#cbd5e1' : '#0f172a'} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sidebarLangBtn, !isDark && styles.sidebarBtnLight]}
                                onPress={cycleLanguage}>
                                <Text style={[styles.sidebarLangText, !isDark && styles.textDark, { fontSize: 24 }]}
                                >
                                    {language === 'ru' ? '\uD83C\uDDF7\uD83C\uDDFA' : language === 'kg' ? '\uD83C\uDDF0\uD83C\uDDEC' : '\uD83C\uDDEC\uD83C\uDDE7'}
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
    const renderHeader = (title) => {
        const isRefreshBusy = refreshing || !!tabLoadingState[activeTab];
        return (
            <View style={[styles.header, !isDark && styles.headerLight]}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={[styles.menuBtn, !isDark && styles.btnLight]}>
                        <Ionicons name="menu-outline" size={20} color={isDark ? '#fff' : '#0f172a'} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, !isDark && styles.textDark]}>{title}</Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={onRefresh} disabled={isRefreshBusy} style={[styles.iconBtn, !isDark && styles.btnLight]}>
                        <Ionicons
                            name={isRefreshBusy ? 'sync' : 'refresh'}
                            size={18}
                            color={isDark ? '#cbd5e1' : '#334155'}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };




    // Search bar component (shared for non-Orders tabs)
    const renderSearchBar = () => (
        <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
                <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                <TextInput
                    style={styles.searchInput}
                    placeholder={TRANSLATIONS.placeholderSearch || 'Search...'}
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

    const renderAnalytics = () => (
        <AdminAnalyticsTab
            TRANSLATIONS={TRANSLATIONS}
            analyticsAreaOptions={analyticsAreaOptions}
            analyticsChartSeries={analyticsChartSeries}
            analyticsCustomRange={analyticsCustomRange}
            analyticsDailySeries={analyticsDailySeries}
            analyticsDetail={analyticsDetail}
            analyticsDispatcherId={analyticsDispatcherId}
            analyticsDispatcherOptions={analyticsDispatcherOptions}
            analyticsDispatcherStats={analyticsDispatcherStats}
            analyticsDispatchers={analyticsDispatchers}
            analyticsFilters={analyticsFilters}
            analyticsGranularity={analyticsGranularity}
            analyticsInfoHandlers={analyticsInfoHandlers}
            analyticsLists={analyticsLists}
            analyticsLocale={analyticsLocale}
            analyticsMasterId={analyticsMasterId}
            analyticsMasterOptions={analyticsMasterOptions}
            analyticsMasterStats={analyticsMasterStats}
            analyticsPeople={analyticsPeople}
            analyticsRange={analyticsRange}
            analyticsSection={analyticsSection}
            analyticsStats={analyticsStats}
            analyticsTooltip={analyticsTooltip}
            analyticsTrendTooltip={analyticsTrendTooltip}
            dispatcherCreatedMeta={dispatcherCreatedMeta}
            dispatcherCreatedSeries={dispatcherCreatedSeries}
            dispatcherHandledMeta={dispatcherHandledMeta}
            dispatcherHandledSeries={dispatcherHandledSeries}
            dispatcherStatusBreakdown={dispatcherStatusBreakdown}
            dispatcherTrendWindow={dispatcherTrendWindow}
            hideAnalyticsTrendTooltip={hideAnalyticsTrendTooltip}
            hidePriceDistTooltip={hidePriceDistTooltip}
            isDark={isDark}
            isWeb={isWeb}
            masterCompletedMeta={masterCompletedMeta}
            masterCompletedSeries={masterCompletedSeries}
            masterRevenueMeta={masterRevenueMeta}
            masterRevenueSeries={masterRevenueSeries}
            masterStatusBreakdown={masterStatusBreakdown}
            masterTrendWindow={masterTrendWindow}
            onSearchAnalyticsDispatchers={searchAnalyticsDispatcherOptions}
            onSearchAnalyticsMasters={searchAnalyticsMasterOptions}
            openAnalyticsOrdersModal={openAnalyticsOrdersModal}
            priceDistChartWidth={priceDistChartWidth}
            priceDistData={priceDistData}
            priceDistGrouping={priceDistGrouping}
            priceDistGroupingNotice={priceDistGroupingNotice}
            priceDistGroupingRules={priceDistGroupingRules}
            priceDistRange={priceDistRange}
            priceDistScope={priceDistScope}
            priceDistTooltip={priceDistTooltip}
            renderHeader={renderHeader}
            serviceFilterOptions={serviceFilterOptions}
            setAnalyticsCustomRange={setAnalyticsCustomRange}
            setAnalyticsDetail={setAnalyticsDetail}
            setAnalyticsDispatcherId={setAnalyticsDispatcherId}
            setAnalyticsFilters={setAnalyticsFilters}
            setAnalyticsGranularity={setAnalyticsGranularity}
            setAnalyticsMasterId={setAnalyticsMasterId}
            setAnalyticsRange={setAnalyticsRange}
            setAnalyticsSection={setAnalyticsSection}
            setPickerModal={setPickerModal}
            setPriceDistChartWidth={setPriceDistChartWidth}
            setPriceDistGrouping={setPriceDistGrouping}
            setPriceDistRange={setPriceDistRange}
            setPriceDistScope={setPriceDistScope}
            setShowAnalyticsEndPicker={setShowAnalyticsEndPicker}
            setShowAnalyticsStartPicker={setShowAnalyticsStartPicker}
            showAnalyticsEndPicker={showAnalyticsEndPicker}
            showAnalyticsStartPicker={showAnalyticsStartPicker}
            showAnalyticsTrendTooltip={showAnalyticsTrendTooltip}
            showPriceDistTooltip={showPriceDistTooltip}
            styles={styles}
            updateAnalyticsTrendTooltipPos={updateAnalyticsTrendTooltipPos}
            updatePriceDistTooltipPos={updatePriceDistTooltipPos}
        />
    );
    const openAnalyticsOrdersModal = (title, predicate, listOverride) => {
        const baseList = listOverride || analyticsOrders;
        const list = predicate ? baseList.filter(predicate) : baseList;
        setStatModalTitle(title);
        setStatFilteredOrders(list);
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
                                    openOrderDetails(item);
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={styles.itemTitle}>{getServiceLabel(item.service_type, t) || 'Service'}</Text>
                                        <Text style={styles.itemSubtitle}>{item.full_address}</Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#ccc' }]}>
                                        <Text style={styles.statusText}>{getOrderStatusLabel(item.status, t)}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center' }}>{TRANSLATIONS.emptyList || 'No orders found'}</Text>}
                    />
                </View>
            </View>
        </Modal>
    );



    const renderPickerModal = () => (
        <Modal visible={pickerModal.visible} transparent animationType="fade">
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.pickerContent}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
                        <TouchableOpacity onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                            <Ionicons name="close" size={24} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>
                    {pickerModal.searchable && (
                        <View style={styles.pickerSearchInputWrapper}>
                            <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                            <TextInput
                                style={styles.pickerSearchInput}
                                placeholder={pickerModal.searchPlaceholder || TRANSLATIONS.placeholderSearch || 'Search...'}
                                placeholderTextColor="#64748b"
                                value={pickerSearchQuery}
                                onChangeText={setPickerSearchQuery}
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            {pickerSearchLoading ? (
                                <ActivityIndicator size="small" color="#64748b" />
                            ) : pickerSearchQuery ? (
                                <TouchableOpacity onPress={() => setPickerSearchQuery('')} style={styles.searchClear}>
                                    <Ionicons name="close-circle" size={16} color="#64748b" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    )}
                    <FlatList
                        style={styles.pickerScroll}
                        data={pickerVisibleOptions}
                        keyExtractor={(item, index) => String(item?.id ?? index)}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item, index }) => {
                            const isSelected = String(pickerModal.value ?? '') === String(item?.id ?? '');
                            return (
                                <TouchableOpacity
                                    key={`${item?.id ?? index}-${index}`}
                                    style={[styles.pickerOption, isSelected && styles.pickerOptionActive]}
                                    onPress={() => {
                                        if (pickerModal.onChange) pickerModal.onChange(item.id);
                                        if (pickerModal.closeOnSelect !== false) {
                                            setPickerModal(prev => ({ ...prev, visible: false }));
                                        }
                                    }}
                                >
                                    <View style={styles.pickerOptionInfo}>
                                        <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>
                                            {item?.label}
                                        </Text>
                                        {item?.subtitle ? (
                                            <Text style={[styles.pickerOptionSubText, isSelected && styles.pickerOptionSubTextActive]}>
                                                {item.subtitle}
                                            </Text>
                                        ) : null}
                                    </View>
                                    {isSelected && <Ionicons name="checkmark" size={20} color="#3b82f6" />}
                                </TouchableOpacity>
                            );
                        }}
                        ListEmptyComponent={(
                            <Text style={{ color: '#64748b', textAlign: 'center', paddingVertical: 20 }}>
                                {pickerSearchLoading
                                    ? (TRANSLATIONS.loading || 'Loading...')
                                    : (pickerModal.emptyText || TRANSLATIONS.msgNoMatch || TRANSLATIONS.emptyList || 'No items found')}
                            </Text>
                        )}
                    />
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );

    const renderFilters = () => {
        const statusOptionsWithCounts = STATUS_OPTIONS.map(opt => {
            const label = TRANSLATIONS[opt.label] || opt.label;
            const count = queueFilterOptionCounts.status[opt.id] ?? statusCounts[opt.id] ?? 0;
            return { ...opt, label: `${label} (${count})` };
        });
        const dispatcherOptionsWithCounts = dispatcherFilterOptions.map(opt => ({
            ...opt,
            label: `${opt.label} (${queueFilterOptionCounts.dispatcher[opt.id] ?? 0})`,
        }));
        const urgencyOptionsWithCounts = URGENCY_OPTIONS.map(opt => ({
            ...opt,
            label: `${TRANSLATIONS[opt.label] || opt.label} (${queueFilterOptionCounts.urgency[opt.id] ?? 0})`,
        }));
        const serviceOptionsWithCounts = serviceFilterOptions.map(opt => ({
            ...opt,
            label: `${opt.label} (${queueFilterOptionCounts.service[opt.id] ?? 0})`,
        }));

        const currentStatusLabel = TRANSLATIONS[STATUS_OPTIONS.find(o => o.id === statusFilter)?.label] || statusFilter;
        const currentStatusCount = queueFilterOptionCounts.status[statusFilter] ?? statusCounts[statusFilter] ?? 0;
        const currentDispatcherLabel = dispatcherFilterOptions.find(o => o.id === filterDispatcher)?.label || filterDispatcher;
        const currentUrgencyLabel = TRANSLATIONS[URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label] || filterUrgency;
        const currentServiceLabel = serviceFilterOptions.find(o => o.id === serviceFilter)?.label || serviceFilter;
        const currentSortLabel = TRANSLATIONS[SORT_OPTIONS.find(o => o.id === filterSort)?.label] || filterSort;
        const currentDispatcherCount = queueFilterOptionCounts.dispatcher[filterDispatcher] ?? 0;
        const currentUrgencyCount = queueFilterOptionCounts.urgency[filterUrgency] ?? 0;
        const currentServiceCount = queueFilterOptionCounts.service[serviceFilter] ?? 0;

        return (
            <View style={styles.filtersContainer}>
                {/* Search */}
                <View style={styles.searchRow}>
                    <View style={[styles.searchInputWrapper, !isDark && styles.btnLight]}>
                        <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                        <TextInput
                            style={[styles.searchInput, !isDark && styles.textDark]}
                            placeholder={TRANSLATIONS.placeholderSearch || 'Search...'}
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            value={queueSearch}
                            onChangeText={setQueueSearch}
                        />
                        {queueSearch ? (
                            <TouchableOpacity onPress={() => setQueueSearch('')} style={styles.searchClear}>
                                <Ionicons name="close-circle" size={16} color="#64748b" />
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
                        <Ionicons name={viewMode === 'cards' ? 'list-outline' : 'grid-outline'} size={18} color={isDark ? '#cbd5e1' : '#0f172a'} />
                    </TouchableOpacity>

                    {/* Filter Toggle */}
                    <TouchableOpacity
                        style={[styles.filterShowBtn, showFilters && styles.filterShowBtnActive, !isDark && !showFilters && styles.btnLight]}
                        onPress={() => setShowFilters(!showFilters)}>
                        <Text style={[styles.filterShowBtnText, showFilters && styles.filterShowBtnTextActive]}>
                            {showFilters ? (TRANSLATIONS.hideFilters || 'Hide Filters') : (TRANSLATIONS.showFilters || 'Show Filters')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Dropdown Filters (when shown) */}
                {showFilters && (
                    <View style={styles.filterDropdownRow}>
                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerStatus || 'Status',
                            options: statusOptionsWithCounts,
                            value: statusFilter,
                            onChange: setStatusFilter
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentStatusLabel} ({currentStatusCount})
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerDispatcher || 'Dispatcher',
                            options: dispatcherOptionsWithCounts,
                            value: filterDispatcher,
                            onChange: setFilterDispatcher,
                            searchable: true,
                            searchFields: ['label', 'full_name', 'phone', 'email', 'role'],
                            searchPlaceholder: TRANSLATIONS.placeholderSearch || 'Search dispatcher',
                            emptyText: TRANSLATIONS.noDispatchersFound || 'No dispatchers found',
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentDispatcherLabel} ({currentDispatcherCount})
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerUrgency || 'Urgency',
                            options: urgencyOptionsWithCounts,
                            value: filterUrgency,
                            onChange: setFilterUrgency
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentUrgencyLabel} ({currentUrgencyCount})
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerService || 'Service',
                            options: serviceOptionsWithCounts,
                            value: serviceFilter,
                            onChange: setServiceFilter
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentServiceLabel} ({currentServiceCount})
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerSort || 'Sort',
                            options: SORT_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                            value: filterSort,
                            onChange: setFilterSort
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentSortLabel}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>

                        {/* Clear Filters Button */}
                        <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => {
                            setStatusFilter('Active');
                            setFilterDispatcher('all');
                            setFilterUrgency('all');
                            setServiceFilter('all');
                            setFilterSort('newest');
                            setQueueSearch('');
                        }}>
                            <Text style={styles.clearFiltersBtnText}>{TRANSLATIONS.clear || 'Clear'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderOrders = () => (
        <AdminOrdersTab
            TRANSLATIONS={TRANSLATIONS}
            filterAttentionType={filterAttentionType}
            filteredOrders={filteredOrders}
            isDark={isDark}
            needsActionCount={needsActionCount}
            needsActionOrders={needsActionOrders}
            onRefresh={onRefresh}
            openAssignModalFromQueue={openAssignModalFromQueue}
            openOrderDetails={openOrderDetails}
            queueLoading={queueLoading}
            queuePage={queuePage}
            queueTotalCount={queueTotalCount}
            refreshing={refreshing}
            renderFilters={renderFilters}
            renderHeader={renderHeader}
            setFilterAttentionType={setFilterAttentionType}
            setPickerModal={setPickerModal}
            setQueuePage={setQueuePage}
            setShowNeedsAttention={setShowNeedsAttention}
            setSortOrder={setSortOrder}
            showNeedsAttention={showNeedsAttention}
            sortOrder={sortOrder}
            styles={styles}
            t={t}
            viewMode={viewMode}
        />
    );

    const openDisputeOrder = async (dispute) => {
        try {
            const orderId = dispute?.order?.id || dispute?.order_id;
            if (!orderId) return;
            const parsedDisputeNotes = parseDisputeClientNotes(dispute?.client_notes);
            const disputeContext = {
                id: dispute?.id || null,
                status: String(dispute?.status || 'open'),
                reason: String(dispute?.reason || '').trim(),
                createdAt: dispute?.created_at || null,
                reporterName: dispute?.dispatcher?.full_name || dispute?.client?.full_name || null,
                reporterRole: parsedDisputeNotes?.reporterRole || null,
                reportText: parsedDisputeNotes?.plainNotes || '',
                reportedFinalAmount: parsedDisputeNotes?.reportedFinalAmount,
                masterFinalAmount: parsedDisputeNotes?.masterFinalAmount,
                workPerformed: parsedDisputeNotes?.workPerformed || '',
                hoursWorked: parsedDisputeNotes?.hoursWorked,
            };
            const mergeWithDisputeContext = (order) => ({
                ...(order || {}),
                active_dispute: disputeContext,
            });
            const cachedOrder = (queueOrders || []).find(o => String(o?.id) === String(orderId))
                || (orders || []).find(o => String(o?.id) === String(orderId));
            if (cachedOrder) {
                openOrderDetails(mergeWithDisputeContext(cachedOrder));
                return;
            }
            const order = await ordersService.getOrderById(orderId);
            if (!order) {
                showToast?.(TRANSLATIONS.errorOrderNotFound || 'Order not found', 'error');
                return;
            }
            openOrderDetails(mergeWithDisputeContext(order));
        } catch (error) {
            showToast?.((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        }
    };

    const getDisputeStatusLabel = useCallback((status) => {
        const key = String(status || 'open').toLowerCase();
        if (key === 'open') return TRANSLATIONS.disputeStatusOpen || TRANSLATIONS.priceOpen || 'OPEN';
        if (key === 'in_review') return TRANSLATIONS.disputeStatusInReview || 'IN REVIEW';
        if (key === 'resolved') return TRANSLATIONS.disputeStatusResolved || 'RESOLVED';
        if (key === 'closed') return TRANSLATIONS.disputeStatusClosed || 'CLOSED';
        return key.replace(/_/g, ' ').toUpperCase();
    }, [TRANSLATIONS]);

    const getPayoutStatusLabel = useCallback((status) => {
        const key = String(status || 'requested').toLowerCase();
        if (key === 'requested') return TRANSLATIONS.statusRequested || TRANSLATIONS.requested || 'Requested';
        if (key === 'paid') return TRANSLATIONS.statusPaid || TRANSLATIONS.paid || 'Paid';
        if (key === 'rejected') return TRANSLATIONS.statusRejected || TRANSLATIONS.rejected || 'Rejected';
        if (key === 'canceled') return TRANSLATIONS.statusCanceled || TRANSLATIONS.canceled || 'Canceled';
        return key.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
    }, [TRANSLATIONS]);

    const renderDisputes = () => {
        const activeDisputeIds = new Set(activeDisputes.map((item) => String(item?.id || '')));
        const counts = (disputes || []).reduce((acc, item) => {
            const key = String(item?.status || 'open').toLowerCase();
            if ((key === 'open' || key === 'in_review') && !activeDisputeIds.has(String(item?.id || ''))) {
                return acc;
            }
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const statusColors = {
            open: '#ef4444',
            in_review: '#f59e0b',
            resolved: '#22c55e',
            closed: '#64748b',
        };

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader(TRANSLATIONS.disputes || 'Disputes')}

                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>
                        {TRANSLATIONS.disputesOverview || 'Reports overview'}
                    </Text>
                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                        {(TRANSLATIONS.disputesSummary || 'Open: {0} | In review: {1} | Resolved: {2}')
                            .replace('{0}', String(counts.open || 0))
                            .replace('{1}', String(counts.in_review || 0))
                            .replace('{2}', String(counts.resolved || 0))}
                    </Text>
                </View>

                <FlatList
                    data={activeDisputes}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#3b82f6' : '#0f172a'} />}
                    renderItem={({ item }) => {
                        const parsedDisputeNotes = parseDisputeClientNotes(item?.client_notes);
                        const statusKey = String(item?.status || 'open');
                        const statusColor = statusColors[statusKey] || '#64748b';
                        const orderRefId = item?.order?.id || item?.order_id || null;
                        const orderRefLabel = formatOrderRefLabel(
                            TRANSLATIONS.modalOrderPrefix || TRANSLATIONS.drawerTitle || 'Order #{0}',
                            orderRefId,
                        );
                        const masterName = item?.master?.full_name || 'Master';
                        const dispatcherName = item?.dispatcher?.full_name || item?.client?.full_name || '-';
                        const reporterPrice = parsedDisputeNotes?.reportedFinalAmount;
                        const masterPrice = parsedDisputeNotes?.masterFinalAmount;
                        const cleanNote = parsedDisputeNotes?.plainNotes;
                        return (
                            <TouchableOpacity
                                style={[styles.listItemCard, !isDark && styles.listItemCardLight]}
                                onPress={() => openDisputeOrder(item)}
                            >
                                <View style={styles.peopleRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>
                                            {orderRefLabel}
                                        </Text>
                                        <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                            {TRANSLATIONS.masterRole || 'Master'}: {masterName}
                                        </Text>
                                        <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                            {TRANSLATIONS.dispatcherRole || TRANSLATIONS.partnerRole || 'Reported by'}: {dispatcherName}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                                        <Text style={styles.statusText}>{getDisputeStatusLabel(statusKey)}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary, { marginTop: 10 }]}>
                                    {(item?.reason || '-')}
                                </Text>
                                {(reporterPrice !== null || masterPrice !== null) && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {(TRANSLATIONS.labelFinal || 'Final')} ({TRANSLATIONS.dispatcherRole || TRANSLATIONS.partnerRole || 'Reporter'}): {reporterPrice !== null ? `${reporterPrice}c` : '-'} | {TRANSLATIONS.labelFinal || 'Final'} ({TRANSLATIONS.masterRole || 'Master'}): {masterPrice !== null ? `${masterPrice}c` : '-'}
                                    </Text>
                                )}
                                {!!cleanNote && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {cleanNote}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={[styles.emptyText, !isDark && styles.textSecondary]}>
                                {TRANSLATIONS.emptyList || 'No items found'}
                            </Text>
                        </View>
                    }
                />
            </View>
        );
    };

    const renderMasters = () => {
        const normalizedSearch = normalizeSearchTerm(searchQuery);
        const filtered = masters.filter(m => (
            !normalizedSearch
            || optionMatchesSearch(m, normalizedSearch, ['full_name', 'name', 'phone', 'email', 'service_area'])
        ));
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <View style={{ flex: 1 }}>
                {renderSearchBar()}
                <View style={styles.paginationTopRow}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(filtered.length / itemsPerPage)}
                        onPageChange={setCurrentPage}
                        className={styles.paginationTopCompact}
                    />
                </View>
                <FlatList
                    data={paginated}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{TRANSLATIONS.noMastersFound || 'No masters found'}</Text>}
                    renderItem={({ item }) => (
                        <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                            <View style={styles.peopleRow}>
                                <TouchableOpacity
                                    style={styles.peopleLeft}
                                    onPress={() => setDetailsPerson({ ...item, type: 'master' })}
                                >
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_verified ? '#22c55e' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View style={styles.peopleInfo}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]} numberOfLines={1}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle} numberOfLines={1}>{item.phone}</Text>
                                        <View style={styles.peopleMetaRow}>
                                            <View style={[
                                                styles.peopleMetaChip,
                                                {
                                                    backgroundColor: item.is_verified ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                                                    borderColor: item.is_verified ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
                                                    paddingVertical: 2,
                                                    paddingHorizontal: 7,
                                                },
                                                !isDark && {
                                                    backgroundColor: item.is_verified ? '#dcfce7' : '#fee2e2',
                                                    borderColor: item.is_verified ? '#86efac' : '#fca5a5',
                                                },
                                            ]}>
                                                <Text style={[styles.peopleMetaChipText, !isDark && styles.peopleMetaChipTextLight]}>
                                                    {(item.is_verified ? (TRANSLATIONS.verified || 'Verified') : (TRANSLATIONS.unverified || 'Unverified')).toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                                    <View style={styles.peopleRight}>
                                        <View style={styles.peopleInlineControls}>
                                            <View style={[
                                                styles.peopleBadge,
                                                {
                                                    backgroundColor: (item.prepaid_balance || 0) >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    borderColor: (item.prepaid_balance || 0) >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    marginBottom: 0,
                                                }
                                            ]}>
                                                <Text style={[
                                                    styles.peopleBadgeText,
                                                    { color: (item.prepaid_balance || 0) >= 0 ? '#22c55e' : '#ef4444' }
                                                ]} numberOfLines={1}>
                                                    {Number(item.prepaid_balance || 0).toFixed(0)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                </Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setDetailsPerson({ ...item, type: 'master' })}
                                            style={{ paddingVertical: 4, paddingHorizontal: 2 }}
                                        >
                                            <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                {TRANSLATIONS.tapToEdit || TRANSLATIONS.tapViewDetails || 'Tap to edit'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                            </View>
                        </View>
                    )}
                />
            </View>
        );
    };



    const renderStaff = () => {
        const normalizedSearch = normalizeSearchTerm(searchQuery);
        const filtered = dispatchers.filter(d => (
            !normalizedSearch
            || optionMatchesSearch(d, normalizedSearch, ['full_name', 'name', 'phone', 'email'])
        ));
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <View style={{ flex: 1 }}>
                {renderSearchBar()}
                <View style={styles.paginationTopRow}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(filtered.length / itemsPerPage)}
                        onPageChange={setCurrentPage}
                        className={styles.paginationTopCompact}
                    />
                </View>
                <FlatList
                    data={paginated}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{TRANSLATIONS.noDispatchersFound || 'No dispatchers found'}</Text>}
                    renderItem={({ item }) => (
                        <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                            <View style={styles.peopleRow}>
                                <TouchableOpacity
                                    style={styles.peopleLeft}
                                    onPress={() => setDetailsPerson({ ...item, type: 'dispatcher' })}
                                >
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_verified ? '#22c55e' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View style={styles.peopleInfo}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]} numberOfLines={1}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle} numberOfLines={1}>{item.phone || item.email}</Text>
                                        <View style={styles.peopleMetaRow}>
                                            <View style={[
                                                styles.peopleMetaChip,
                                                {
                                                    backgroundColor: item.is_verified ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                                                    borderColor: item.is_verified ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
                                                    paddingVertical: 2,
                                                    paddingHorizontal: 7,
                                                },
                                                !isDark && {
                                                    backgroundColor: item.is_verified ? '#dcfce7' : '#fee2e2',
                                                    borderColor: item.is_verified ? '#86efac' : '#fca5a5',
                                                },
                                            ]}>
                                                <Text style={[styles.peopleMetaChipText, !isDark && styles.peopleMetaChipTextLight]}>
                                                    {(item.is_verified ? (TRANSLATIONS.verified || 'Verified') : (TRANSLATIONS.unverified || 'Unverified')).toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                                <View style={styles.peopleRight}>
                                    <TouchableOpacity
                                        onPress={() => setDetailsPerson({ ...item, type: 'dispatcher' })}
                                        style={{ paddingVertical: 4, paddingHorizontal: 2 }}
                                    >
                                        <Text style={{ color: '#64748b', fontSize: 11 }}>
                                            {TRANSLATIONS.tapToEdit || TRANSLATIONS.tapViewDetails || 'Tap to edit'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                />
            </View>
        );
    };

    const renderPartners = () => {
        const filtered = partners.filter((p) =>
            !searchQuery
            || p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
            || p.phone?.toLowerCase().includes(searchQuery.toLowerCase())
            || p.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <View style={{ flex: 1 }}>
                {renderSearchBar()}
                <View style={styles.paginationTopRow}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(filtered.length / itemsPerPage)}
                        onPageChange={setCurrentPage}
                        className={styles.paginationTopCompact}
                    />
                </View>
                <FlatList
                    data={paginated}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{TRANSLATIONS.noPartnersFound || 'No partners found'}</Text>}
                    renderItem={({ item }) => {
                        const commissionPercent = Number(item.partner_commission_rate || 0) * 100;
                        const balanceValue = Number(item.partner_balance || 0);
                        return (
                            <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                                <View style={styles.peopleRow}>
                                    <TouchableOpacity
                                        style={styles.peopleLeft}
                                        onPress={() => setDetailsPerson({ ...item, type: 'partner' })}
                                    >
                                        <View style={[styles.avatarCircle, { backgroundColor: item.is_verified ? '#0ea5e9' : '#64748b' }]}>
                                            <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0) || 'P'}</Text>
                                        </View>
                                        <View style={styles.peopleInfo}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]} numberOfLines={1}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle} numberOfLines={1}>{item.phone || item.email || '-'}</Text>
                                        <View style={styles.peopleMetaRow}>
                                            <View style={[
                                                styles.peopleMetaChip,
                                                {
                                                    backgroundColor: item.is_verified ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                                                    borderColor: item.is_verified ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
                                                    paddingVertical: 2,
                                                    paddingHorizontal: 7,
                                                },
                                                !isDark && {
                                                    backgroundColor: item.is_verified ? '#dcfce7' : '#fee2e2',
                                                    borderColor: item.is_verified ? '#86efac' : '#fca5a5',
                                                },
                                            ]}>
                                                <Text style={[styles.peopleMetaChipText, !isDark && styles.peopleMetaChipTextLight]}>
                                                    {(item.is_verified ? (TRANSLATIONS.verified || 'Verified') : (TRANSLATIONS.unverified || 'Unverified')).toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={[styles.peopleMetaChip, !isDark && styles.peopleMetaChipLight]}>
                                                <Text style={[styles.peopleMetaChipText, !isDark && styles.peopleMetaChipTextLight]}>
                                                    {Number.isFinite(commissionPercent) ? commissionPercent.toFixed(1) : '0.0'}%
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.peopleRight}>
                                        <View style={styles.peopleInlineControls}>
                                            <View style={[
                                                styles.peopleBadge,
                                                {
                                                    backgroundColor: balanceValue >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    borderColor: balanceValue >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                    marginBottom: 0,
                                                }
                                            ]}>
                                                <Text style={[
                                                    styles.peopleBadgeText,
                                                    { color: balanceValue >= 0 ? '#22c55e' : '#ef4444' }
                                                ]} numberOfLines={1}>
                                                    {Number.isFinite(balanceValue) ? balanceValue.toFixed(0) : '0'} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                </Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => setDetailsPerson({ ...item, type: 'partner' })}
                                            style={{ paddingVertical: 4, paddingHorizontal: 2 }}
                                        >
                                            <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                {TRANSLATIONS.tapToEdit || TRANSLATIONS.tapViewDetails || 'Tap to edit'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />
            </View>
        );
    };

    const renderSettingsPage = () => (
        <AdminSettingsTab
            styles={styles}
            isDark={isDark}
            TRANSLATIONS={TRANSLATIONS}
            districtSearch={districtSearch}
            setDistrictSearch={setDistrictSearch}
            managedDistricts={managedDistricts}
            cancellationSearch={cancellationSearch}
            setCancellationSearch={setCancellationSearch}
            cancellationReasons={cancellationReasons}
            getLocalizedName={getLocalizedName}
            renderHeader={renderHeader}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            setConfigurationCollapsed={setConfigurationCollapsed}
            setTempSettings={setTempSettings}
            tempSettings={tempSettings}
            settings={settings}
            setActionLoading={setActionLoading}
            actionLoading={actionLoading}
            showToast={showToast}
            loadSettings={loadSettings}
            onSettingsUpdated={() => markTabsDirty(['analytics', 'create_order', 'orders'], 'platform_settings_save')}
            ordersService={ordersService}
            configurationCollapsed={configurationCollapsed}
            setDistrictModal={setDistrictModal}
            setDistrictsCollapsed={setDistrictsCollapsed}
            districtsCollapsed={districtsCollapsed}
            handleDeleteDistrict={handleDeleteDistrict}
            setCancellationReasonModal={setCancellationReasonModal}
            setCancellationReasonsCollapsed={setCancellationReasonsCollapsed}
            cancellationReasonsCollapsed={cancellationReasonsCollapsed}
            handleDeleteCancellationReason={handleDeleteCancellationReason}
            setServiceTypeModal={setServiceTypeModal}
            setServiceTypesCollapsed={setServiceTypesCollapsed}
            serviceTypesCollapsed={serviceTypesCollapsed}
            serviceTypes={serviceTypes}
            handleDeleteServiceType={handleDeleteServiceType}
            renderServiceTypeSidebar={renderServiceTypeSidebar}
            renderDistrictSidebar={renderDistrictSidebar}
            renderCancellationReasonSidebar={renderCancellationReasonSidebar}
        />
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
                                    {serviceTypeModal.type ? (TRANSLATIONS.editServiceType || 'Edit Service Type') : (TRANSLATIONS.addServiceType || 'Add Service Type')}
                                </Text>
                                <Text style={styles.sidebarDrawerSubtitle}>
                                    {serviceTypeModal.type ? (TRANSLATIONS.modifyExistingService || 'Modify existing service') : (TRANSLATIONS.createNewCategory || 'Create a new service category')}
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
                                    {TRANSLATIONS.codeUnique || 'Code (Unique ID)'} {serviceTypeModal.type && <Text style={{ color: '#64748b' }}>- {TRANSLATIONS.codeReadOnly || 'Read-only'}</Text>}
                                </Text>
                                <TextInput
                                    style={[
                                        styles.sidebarFormInput,
                                        !isDark && styles.sidebarFormInputLight,
                                        serviceTypeModal.type && styles.sidebarFormInputDisabled
                                    ]}
                                    value={tempServiceType.code || ''}
                                    onChangeText={v => setTempServiceType({ ...tempServiceType, code: v })}
                                    placeholder={TRANSLATIONS.placeholderServiceCode || 'e.g. plumbing, electrician'}
                                    placeholderTextColor="#64748b"
                                    editable={!serviceTypeModal.type}
                                />
                            </View>

                            {/* Names Section */}
                            <View style={[styles.sidebarFormSection, !isDark && styles.sidebarFormSectionLight]}>
                                <Text style={styles.sidebarFormSectionTitle}>
                                    <Ionicons name="globe-outline" size={14} color="#64748b" /> {TRANSLATIONS.localizedNames || 'Localized Names'}
                                </Text>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.englishName || 'English Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_en || ''}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_en: v })}
                                        placeholder={TRANSLATIONS.placeholderServiceNameEn || 'Service name'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.russianName || 'Russian Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_ru || ''}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_ru: v })}
                                        placeholder={TRANSLATIONS.placeholderServiceNameRu || 'Service name (RU)'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.kyrgyzName || 'Kyrgyz Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_kg || ''}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_kg: v })}
                                        placeholder={TRANSLATIONS.placeholderServiceNameKg || 'Service name (KG)'}
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
                            <Text style={[styles.sidebarDrawerBtnText, { color: isDark ? '#94a3b8' : '#64748b' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
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
                                    {serviceTypeModal.type ? (TRANSLATIONS.updateService || 'Update Service') : (TRANSLATIONS.createService || 'Create Service')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );

    const renderDistrictSidebar = () => (
        <Modal
            visible={districtModal.visible}
            transparent
            animationType="none"
            onRequestClose={() => setDistrictModal({ visible: false, district: null })}
        >
            <View style={styles.sidebarDrawerOverlay}>
                <TouchableOpacity
                    style={styles.sidebarDrawerBackdrop}
                    activeOpacity={1}
                    onPress={() => setDistrictModal({ visible: false, district: null })}
                />

                <Animated.View style={[styles.sidebarDrawerContent, !isDark && styles.sidebarDrawerContentLight]}>
                    <View style={[styles.sidebarDrawerHeader, !isDark && styles.sidebarDrawerHeaderLight]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[styles.sidebarDrawerIconWrapper, { backgroundColor: districtModal.district ? 'rgba(59, 130, 246, 0.15)' : 'rgba(14, 165, 233, 0.15)' }]}>
                                <Ionicons
                                    name={districtModal.district ? "pencil" : "add"}
                                    size={20}
                                    color={districtModal.district ? "#3b82f6" : "#0ea5e9"}
                                />
                            </View>
                            <View>
                                <Text style={[styles.sidebarDrawerTitle, !isDark && styles.textDark]}>
                                    {districtModal.district ? (TRANSLATIONS.editDistrict || 'Edit District') : (TRANSLATIONS.addDistrict || 'Add District')}
                                </Text>
                                <Text style={styles.sidebarDrawerSubtitle}>
                                    {districtModal.district ? (TRANSLATIONS.modifyExistingDistrict || 'Modify existing district') : (TRANSLATIONS.createNewDistrict || 'Create a new district')}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={() => setDistrictModal({ visible: false, district: null })}
                            style={[styles.sidebarDrawerCloseBtn, !isDark && styles.sidebarDrawerCloseBtnLight]}
                        >
                            <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.sidebarDrawerBody} showsVerticalScrollIndicator={false}>
                        <View style={{ gap: 20 }}>
                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                    {TRANSLATIONS.codeUnique || 'Code (Unique ID)'} {districtModal.district && <Text style={{ color: '#64748b' }}>- {TRANSLATIONS.codeReadOnly || 'Read-only'}</Text>}
                                </Text>
                                <TextInput
                                    style={[
                                        styles.sidebarFormInput,
                                        !isDark && styles.sidebarFormInputLight,
                                        districtModal.district && styles.sidebarFormInputDisabled
                                    ]}
                                    value={tempDistrict.code || ''}
                                    onChangeText={v => setTempDistrict({ ...tempDistrict, code: v })}
                                    placeholder={TRANSLATIONS.placeholderDistrictCode || 'e.g. oktyabrsky'}
                                    placeholderTextColor="#64748b"
                                    editable={!districtModal.district}
                                />
                            </View>

                            <View style={[styles.sidebarFormSection, !isDark && styles.sidebarFormSectionLight]}>
                                <Text style={styles.sidebarFormSectionTitle}>
                                    <Ionicons name="globe-outline" size={14} color="#64748b" /> {TRANSLATIONS.localizedNames || 'Localized Names'}
                                </Text>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.englishName || 'English Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempDistrict.name_en || ''}
                                        onChangeText={v => setTempDistrict({ ...tempDistrict, name_en: v })}
                                        placeholder={TRANSLATIONS.placeholderDistrictNameEn || 'District name'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.russianName || 'Russian Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempDistrict.name_ru || ''}
                                        onChangeText={v => setTempDistrict({ ...tempDistrict, name_ru: v })}
                                        placeholder={TRANSLATIONS.placeholderDistrictNameRu || 'District name (RU)'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.kyrgyzName || 'Kyrgyz Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempDistrict.name_kg || ''}
                                        onChangeText={v => setTempDistrict({ ...tempDistrict, name_kg: v })}
                                        placeholder={TRANSLATIONS.placeholderDistrictNameKg || 'District name (KG)'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.region || 'Region'}</Text>
                                <TextInput
                                    style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                    value={tempDistrict.region || ''}
                                    onChangeText={v => setTempDistrict({ ...tempDistrict, region: v })}
                                    placeholder={TRANSLATIONS.placeholderRegion || 'e.g. Bishkek'}
                                    placeholderTextColor="#64748b"
                                />
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.sortOrder || 'Sort Order'}</Text>
                                <TextInput
                                    style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                    value={String(tempDistrict.sort_order || '')}
                                    onChangeText={v => setTempDistrict({ ...tempDistrict, sort_order: v })}
                                    placeholder={TRANSLATIONS.placeholderDistrictSortOrder || '99'}
                                    placeholderTextColor="#64748b"
                                    keyboardType="numeric"
                                />
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.status || 'Status'}</Text>
                                <TouchableOpacity
                                    style={[styles.togglePill, tempDistrict.is_active ? styles.toggleActive : styles.toggleInactive]}
                                    onPress={() => setTempDistrict(prev => ({ ...prev, is_active: !prev.is_active }))}
                                >
                                    <Text style={styles.toggleText}>
                                        {tempDistrict.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>

                    <View style={[styles.sidebarDrawerFooter, !isDark && styles.sidebarDrawerFooterLight]}>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnSecondary, !isDark && styles.sidebarDrawerBtnSecondaryLight]}
                            onPress={() => setDistrictModal({ visible: false, district: null })}
                        >
                            <Text style={[styles.sidebarDrawerBtnText, { color: isDark ? '#94a3b8' : '#64748b' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnPrimary]}
                            onPress={() => handleSaveDistrict(tempDistrict)}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={[styles.sidebarDrawerBtnText, { color: '#fff' }]}>
                                    {districtModal.district ? (TRANSLATIONS.updateDistrict || 'Update District') : (TRANSLATIONS.addDistrict || 'Add District')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );

    const renderCancellationReasonSidebar = () => (
        <Modal
            visible={cancellationReasonModal.visible}
            transparent
            animationType="none"
            onRequestClose={() => setCancellationReasonModal({ visible: false, reason: null })}
        >
            <View style={styles.sidebarDrawerOverlay}>
                <TouchableOpacity
                    style={styles.sidebarDrawerBackdrop}
                    activeOpacity={1}
                    onPress={() => setCancellationReasonModal({ visible: false, reason: null })}
                />

                <Animated.View style={[styles.sidebarDrawerContent, !isDark && styles.sidebarDrawerContentLight]}>
                    <View style={[styles.sidebarDrawerHeader, !isDark && styles.sidebarDrawerHeaderLight]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[styles.sidebarDrawerIconWrapper, { backgroundColor: cancellationReasonModal.reason ? 'rgba(59, 130, 246, 0.15)' : 'rgba(244, 114, 182, 0.15)' }]}>
                                <Ionicons
                                    name={cancellationReasonModal.reason ? "pencil" : "add"}
                                    size={20}
                                    color={cancellationReasonModal.reason ? "#3b82f6" : "#f472b6"}
                                />
                            </View>
                            <View>
                                <Text style={[styles.sidebarDrawerTitle, !isDark && styles.textDark]}>
                                    {cancellationReasonModal.reason ? (TRANSLATIONS.editCancellationReason || 'Edit Reason') : (TRANSLATIONS.addCancellationReason || 'Add Reason')}
                                </Text>
                                <Text style={styles.sidebarDrawerSubtitle}>
                                    {cancellationReasonModal.reason ? (TRANSLATIONS.modifyExistingCancellationReason || 'Modify existing reason') : (TRANSLATIONS.createNewCancellationReason || 'Create a new cancellation reason')}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={() => setCancellationReasonModal({ visible: false, reason: null })}
                            style={[styles.sidebarDrawerCloseBtn, !isDark && styles.sidebarDrawerCloseBtnLight]}
                        >
                            <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.sidebarDrawerBody} showsVerticalScrollIndicator={false}>
                        <View style={{ gap: 20 }}>
                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                    {TRANSLATIONS.codeUnique || 'Code (Unique ID)'} {cancellationReasonModal.reason && <Text style={{ color: '#64748b' }}>- {TRANSLATIONS.codeReadOnly || 'Read-only'}</Text>}
                                </Text>
                                <TextInput
                                    style={[
                                        styles.sidebarFormInput,
                                        !isDark && styles.sidebarFormInputLight,
                                        cancellationReasonModal.reason && styles.sidebarFormInputDisabled
                                    ]}
                                    value={tempCancellationReason.code || ''}
                                    onChangeText={v => setTempCancellationReason({ ...tempCancellationReason, code: v })}
                                    placeholder={TRANSLATIONS.placeholderReasonCode || 'e.g. client_request'}
                                    placeholderTextColor="#64748b"
                                    editable={!cancellationReasonModal.reason}
                                />
                            </View>

                            <View style={[styles.sidebarFormSection, !isDark && styles.sidebarFormSectionLight]}>
                                <Text style={styles.sidebarFormSectionTitle}>
                                    <Ionicons name="globe-outline" size={14} color="#64748b" /> {TRANSLATIONS.localizedNames || 'Localized Names'}
                                </Text>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.englishName || 'English Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempCancellationReason.name_en || ''}
                                        onChangeText={v => setTempCancellationReason({ ...tempCancellationReason, name_en: v })}
                                        placeholder={TRANSLATIONS.placeholderReasonNameEn || 'Reason name'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.russianName || 'Russian Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempCancellationReason.name_ru || ''}
                                        onChangeText={v => setTempCancellationReason({ ...tempCancellationReason, name_ru: v })}
                                        placeholder={TRANSLATIONS.placeholderReasonNameRu || 'Reason name (RU)'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.kyrgyzName || 'Kyrgyz Name'}
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempCancellationReason.name_kg || ''}
                                        onChangeText={v => setTempCancellationReason({ ...tempCancellationReason, name_kg: v })}
                                        placeholder={TRANSLATIONS.placeholderReasonNameKg || 'Reason name (KG)'}
                                        placeholderTextColor="#64748b"
                                    />
                                </View>
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.applicableTo || 'Applies to'}</Text>
                                <View style={styles.pillRow}>
                                    {['both', 'master', 'client'].map(scope => {
                                        const isActive = (tempCancellationReason.applicable_to || 'both') === scope;
                                        const label = scope === 'master'
                                            ? (TRANSLATIONS.appliesToMaster || 'Master')
                                            : scope === 'client'
                                                ? (TRANSLATIONS.appliesToClient || 'Client')
                                                : (TRANSLATIONS.appliesToBoth || 'Both');
                                        return (
                                            <TouchableOpacity
                                                key={scope}
                                                onPress={() => setTempCancellationReason(prev => ({ ...prev, applicable_to: scope }))}
                                                style={[
                                                    styles.pillBtn,
                                                    !isDark && styles.pillBtnLight,
                                                    isActive && styles.pillBtnActive,
                                                    !isDark && isActive && styles.pillBtnActiveLight
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.pillText,
                                                    !isDark && styles.pillTextLight,
                                                    isActive && styles.pillTextActive,
                                                    !isDark && isActive && styles.pillTextActiveLight
                                                ]}>{label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.sortOrder || 'Sort Order'}</Text>
                                <TextInput
                                    style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                    value={String(tempCancellationReason.sort_order || '')}
                                    onChangeText={v => setTempCancellationReason({ ...tempCancellationReason, sort_order: v })}
                                    placeholder={TRANSLATIONS.placeholderReasonSortOrder || '0'}
                                    placeholderTextColor="#64748b"
                                    keyboardType="numeric"
                                />
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.status || 'Status'}</Text>
                                <TouchableOpacity
                                    style={[styles.togglePill, tempCancellationReason.is_active ? styles.toggleActive : styles.toggleInactive]}
                                    onPress={() => setTempCancellationReason(prev => ({ ...prev, is_active: !prev.is_active }))}
                                >
                                    <Text style={styles.toggleText}>
                                        {tempCancellationReason.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>

                    <View style={[styles.sidebarDrawerFooter, !isDark && styles.sidebarDrawerFooterLight]}>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnSecondary, !isDark && styles.sidebarDrawerBtnSecondaryLight]}
                            onPress={() => setCancellationReasonModal({ visible: false, reason: null })}
                        >
                            <Text style={[styles.sidebarDrawerBtnText, { color: isDark ? '#94a3b8' : '#64748b' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnPrimary]}
                            onPress={() => handleSaveCancellationReason(tempCancellationReason)}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={[styles.sidebarDrawerBtnText, { color: '#fff' }]}>
                                    {cancellationReasonModal.reason ? (TRANSLATIONS.updateCancellationReason || 'Update Reason') : (TRANSLATIONS.createCancellationReason || 'Create Reason')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );

    const renderPayouts = () => {
        const statusOptions = [
            { id: 'requested', label: TRANSLATIONS.statusRequested || 'Requested' },
            { id: 'paid', label: TRANSLATIONS.statusPaid || 'Paid' },
            { id: 'rejected', label: TRANSLATIONS.statusRejected || TRANSLATIONS.reject || 'Rejected' },
            { id: 'canceled', label: TRANSLATIONS.statusCanceled || 'Canceled' },
            { id: 'all', label: TRANSLATIONS.filterAll || 'All' },
        ];
        const statusColorMap = {
            requested: '#f59e0b',
            paid: '#22c55e',
            rejected: '#ef4444',
            canceled: '#64748b',
        };

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader(TRANSLATIONS.payouts || 'Payouts')}
                {renderSearchBar()}

                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>
                        {TRANSLATIONS.payoutsOverview || 'Payout requests overview'}
                    </Text>
                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                        {(TRANSLATIONS.payoutsSummary || 'Requested: {0} | Paid: {1} | Rejected: {2} | Canceled: {3}')
                            .replace('{0}', String(payoutStatusCounts.requested || 0))
                            .replace('{1}', String(payoutStatusCounts.paid || 0))
                            .replace('{2}', String(payoutStatusCounts.rejected || 0))
                            .replace('{3}', String(payoutStatusCounts.canceled || 0))}
                    </Text>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12, flexGrow: 0 }}
                    contentContainerStyle={{ gap: 8, paddingRight: 8, alignItems: 'center' }}
                >
                    {statusOptions.map((option) => {
                        const isActive = adminPayoutStatusFilter === option.id;
                        const count = Number(payoutStatusCounts?.[option.id] || 0);
                        return (
                            <TouchableOpacity
                                key={option.id}
                                style={[
                                    styles.pillBtn,
                                    isActive && styles.pillBtnActive,
                                    !isDark && styles.pillBtnLight,
                                    !isDark && isActive && styles.pillBtnActiveLight,
                                    { alignSelf: 'flex-start' },
                                ]}
                                onPress={() => setAdminPayoutStatusFilter(option.id)}
                            >
                                <Text
                                    style={[
                                        styles.pillText,
                                        !isDark && styles.pillTextLight,
                                        isActive && styles.pillTextActive,
                                        !isDark && isActive && styles.pillTextActiveLight,
                                    ]}
                                >
                                    {option.label} ({count})
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <FlatList
                    data={filteredPayoutRequests}
                    keyExtractor={(item, index) => String(item?.id || index)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={(
                        <RefreshControl
                            refreshing={refreshing || !!tabLoadingState.payouts}
                            onRefresh={onRefresh}
                            tintColor={isDark ? '#3b82f6' : '#0f172a'}
                        />
                    )}
                    renderItem={({ item }) => {
                        const status = String(item?.status || 'requested').toLowerCase();
                        const statusColor = statusColorMap[status] || '#64748b';
                        const partnerName = item?.partner?.full_name
                            || item?.partner?.email
                            || item?.partner?.phone
                            || `${TRANSLATIONS.partnerRole || 'Partner'} ${String(item?.partner_id || '').slice(0, 6)}`;
                        const partnerContact = item?.partner?.phone || item?.partner?.email || '-';
                        const requestedAmount = Number(item?.requested_amount || 0);
                        const approvedAmount = item?.approved_amount !== null && item?.approved_amount !== undefined
                            ? Number(item?.approved_amount || 0)
                            : null;
                        const isRowLoading = actionLoading && String(adminPayoutActionId || '') === String(item?.id || '');

                        return (
                            <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                                <View style={styles.peopleRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{partnerName}</Text>
                                        <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>{partnerContact}</Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
                                        <Text style={[styles.statusText, { color: statusColor }]}>{getPayoutStatusLabel(status)}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary, { marginTop: 8 }]}>
                                    {(TRANSLATIONS.requested || 'Requested')}: {requestedAmount.toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                </Text>
                                {approvedAmount !== null && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {(TRANSLATIONS.approved || 'Approved')}: {approvedAmount.toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                    </Text>
                                )}
                                <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                    {item?.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                                </Text>
                                {!!item?.requested_note && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {(TRANSLATIONS.labelRequestNote || TRANSLATIONS.note || 'Request note')}: {item.requested_note}
                                    </Text>
                                )}
                                {!!item?.admin_note && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {(TRANSLATIONS.note || 'Note')}: {item.admin_note}
                                    </Text>
                                )}
                                {!!item?.processed_at && (
                                    <Text style={[styles.itemSubtitle, !isDark && styles.textSecondary]}>
                                        {(TRANSLATIONS.processedAt || 'Processed')}: {new Date(item.processed_at).toLocaleString()}
                                    </Text>
                                )}
                                {status === 'requested' && (
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { flex: 1, marginTop: 0, backgroundColor: '#16a34a', opacity: isRowLoading ? 0.7 : 1 }]}
                                            onPress={() => handleProcessPayoutFromTab(item, 'paid')}
                                            disabled={isRowLoading}
                                        >
                                            {isRowLoading ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.markPaid || 'Mark paid'}</Text>
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { flex: 1, marginTop: 0, backgroundColor: '#dc2626', opacity: isRowLoading ? 0.7 : 1 }]}
                                            onPress={() => handleProcessPayoutFromTab(item, 'rejected')}
                                            disabled={isRowLoading}
                                        >
                                            {isRowLoading ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.reject || 'Reject'}</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        );
                    }}
                    ListEmptyComponent={(
                        <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>
                            {TRANSLATIONS.noPayoutRequestsFound || TRANSLATIONS.noData || 'No payout requests found'}
                        </Text>
                    )}
                />
            </View>
        );
    };

    const renderPeople = () => (
        <AdminPeopleTab
            styles={styles}
            isDark={isDark}
            TRANSLATIONS={TRANSLATIONS}
            peopleView={peopleView}
            setPeopleView={setPeopleView}
            setAddUserRole={setAddUserRole}
            setShowAddUserModal={setShowAddUserModal}
            renderMasters={renderMasters}
            renderStaff={renderStaff}
            renderPartners={renderPartners}
            renderHeader={renderHeader}
        />
    );

    // --- Ported Renderers ---
    const renderCreateOrder = () => {
        const serviceTypeOptions = serviceTypes.length
            ? serviceTypes.map(st => ({
                id: st.code || st.id,
                label: st[`name_${language}`] || st.name_en || st.code || st.id
            }))
            : SERVICE_TYPES;
        const selectedDistrictLabel = newOrder.area
            ? (districts.find(d => d.id === newOrder.area)?.label || newOrder.area)
            : (TRANSLATIONS.selectOption || 'Select');

        const publishDisabled = !confirmChecked || actionLoading;

        const renderSuccess = () => (
            <View style={styles.successContainer}>
                <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
                <Text style={[styles.successTitle, !isDark && styles.textDark]}>
                    {TRANSLATIONS.createSuccess || TRANSLATIONS.toastOrderCreated || 'Order created!'}
                </Text>
                <Text style={styles.successId}>#{creationSuccess.id}</Text>
                <TouchableOpacity
                    style={styles.successBtn}
                    onPress={() => {
                        setActiveTab('orders');
                        setCreationSuccess(null);
                        clearCreateOrderForm();
                    }}
                >
                    <Text style={styles.successBtnText}>
                        {TRANSLATIONS.createViewQueue || TRANSLATIONS.ordersQueue || TRANSLATIONS.orders || 'View orders'}
                    </Text>
                </TouchableOpacity>
                <View style={styles.successDivider}>
                    <Text style={styles.successDividerText}>
                        {TRANSLATIONS.createAnotherOrder || 'Create another order'}
                    </Text>
                </View>
                <View style={styles.successButtonRow}>
                    <TouchableOpacity style={styles.successKeepLocationBtn} onPress={keepLocationAndReset}>
                        <Text style={styles.successKeepLocationText}>
                            {TRANSLATIONS.keepLocation || 'Keep location'} >
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.successBtnAlt}
                        onPress={() => {
                            setCreationSuccess(null);
                            clearCreateOrderForm();
                        }}
                    >
                        <Text style={styles.successBtnAltText}>
                            {TRANSLATIONS.startFresh || TRANSLATIONS.createClear || 'Start fresh'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );

        const renderForm = () => (
            <View style={styles.createSections}>
                {/* Client */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.createClientDetails || 'Client'}</Text>
                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.createPhone || 'Phone'} *</Text>
                    <View style={styles.inputWithIcon}>
                        <TextInput
                            style={[styles.input, styles.inputWithPaste, phoneError && styles.inputError, !isDark && styles.inputLight]}
                            placeholder="+996..."
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            value={newOrder.clientPhone}
                            onChangeText={t => setNewOrder({ ...newOrder, clientPhone: t })}
                            onBlur={handlePhoneBlur}
                            keyboardType="phone-pad"
                        />
                        <TouchableOpacity style={styles.inFieldBtn} onPress={handlePastePhone}>
                            <Ionicons name="clipboard-outline" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>
                    {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}

                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.createName || 'Name'}</Text>
                    <TextInput
                        style={[styles.input, !isDark && styles.inputLight]}
                        placeholder={TRANSLATIONS.createName || 'Name'}
                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                        value={newOrder.clientName}
                        onChangeText={t => setNewOrder({ ...newOrder, clientName: t })}
                    />
                </View>

                {/* Location */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.createLocation || 'Location'}</Text>

                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.createDistrict || 'District'} *</Text>
                    <TouchableOpacity
                        style={[styles.input, styles.pickerInput, !isDark && styles.inputLight]}
                        onPress={openDistrictPicker}
                    >
                        <Text style={[styles.pickerBtnText, !newOrder.area && styles.placeholderText, !isDark && styles.textDark]}>
                            {selectedDistrictLabel}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                    </TouchableOpacity>

                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.createFullAddress || 'Full Address'} *</Text>
                    <TextInput
                        style={[styles.input, !isDark && styles.inputLight]}
                        placeholder={TRANSLATIONS.createFullAddress || 'Full Address'}
                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                        value={newOrder.fullAddress}
                        onChangeText={t => setNewOrder({ ...newOrder, fullAddress: t })}
                    />

                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.createOrientir || 'Landmark/Orientir'}</Text>
                    <TextInput
                        style={[styles.input, !isDark && styles.inputLight]}
                        placeholder={TRANSLATIONS.orientirPlaceholder || 'e.g. Near Beta Stores'}
                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                        value={newOrder.orientir}
                        onChangeText={t => setNewOrder({ ...newOrder, orientir: t })}
                    />
                </View>

                {/* Service */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.createServiceType || 'Service Type'}</Text>
                    <View style={styles.serviceGrid}>
                        {serviceTypeOptions.map(s => (
                            <TouchableOpacity
                                key={s.id}
                                style={[styles.serviceBtn, newOrder.serviceType === s.id && styles.serviceBtnActive, !isDark && newOrder.serviceType !== s.id && styles.btnLight]}
                                onPress={() => setNewOrder({ ...newOrder, serviceType: s.id })}
                            >
                                <Text style={[styles.serviceBtnText, !isDark && newOrder.serviceType !== s.id && styles.textDark, newOrder.serviceType === s.id && styles.serviceBtnTextActive]}>{s.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.problemDesc || 'Problem Description'} *</Text>
                    <View style={{ position: 'relative' }}>
                        <TextInput
                            style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                            placeholder="..."
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            value={newOrder.problemDescription}
                            onChangeText={t => setNewOrder({ ...newOrder, problemDescription: t.substring(0, 500) })}
                            multiline
                            numberOfLines={3}
                            maxLength={500}
                        />
                        <Text style={styles.charCounter}>{(newOrder.problemDescription || '').length}/500</Text>
                    </View>
                </View>

                {/* Schedule */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.schedule || 'Schedule'}</Text>
                    <View style={styles.urgencyRow}>
                        <TouchableOpacity
                            style={[styles.urgencyBtn, newOrder.urgency === 'planned' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'planned' && styles.btnLight]}
                            onPress={() => setNewOrder({ ...newOrder, urgency: 'planned' })}
                        >
                            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'planned' && styles.textDark, newOrder.urgency === 'planned' && styles.urgencyTextActive]}>{TRANSLATIONS.urgencyPlanned || 'Planned'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.urgencyBtn, newOrder.urgency === 'urgent' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'urgent' && styles.btnLight]}
                            onPress={() => setNewOrder({ ...newOrder, urgency: 'urgent' })}
                        >
                            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'urgent' && styles.textDark, newOrder.urgency === 'urgent' && styles.urgencyTextActive]}>{TRANSLATIONS.urgencyUrgent || 'Urgent'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.urgencyBtn, newOrder.urgency === 'emergency' && styles.urgencyBtnActive, { borderColor: '#ef4444' }, !isDark && newOrder.urgency !== 'emergency' && styles.btnLight]}
                            onPress={() => setNewOrder({ ...newOrder, urgency: 'emergency' })}
                        >
                            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'emergency' && styles.textDark, newOrder.urgency === 'emergency' && styles.urgencyTextActive]}>{TRANSLATIONS.urgencyEmergency || 'Emergency'}</Text>
                        </TouchableOpacity>
                    </View>

                    {newOrder.urgency === 'planned' ? (
                        <View style={styles.plannedPickerContainer}>
                            <View style={styles.plannedTimeRow}>
                                <View style={styles.plannedDateInput}>
                                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.preferredDate || 'Date'}</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                                            {React.createElement('input', {
                                                type: 'date',
                                                value: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : '',
                                                onChange: (e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        const [y, m, d] = val.split('-');
                                                        setNewOrder({ ...newOrder, preferredDate: `${d}.${m}.${y}` });
                                                    } else {
                                                        setNewOrder({ ...newOrder, preferredDate: '' });
                                                    }
                                                },
                                                style: { border: 'none', background: 'transparent', color: isDark ? '#fff' : '#0f172a', width: '100%' }
                                            })}
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.input, styles.datePickerButton, !isDark && styles.inputLight]}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Text style={[styles.datePickerText, !newOrder.preferredDate && styles.placeholderText, !isDark && styles.textDark]}>
                                                {newOrder.preferredDate || (TRANSLATIONS.selectOption || 'Select')}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <View style={styles.plannedTimeInput}>
                                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.preferredTime || 'Time'}</Text>
                                    {Platform.OS === 'web' ? (
                                        <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                                            {React.createElement('input', {
                                                type: 'time',
                                                value: newOrder.preferredTime || '',
                                                onChange: (e) => setNewOrder({ ...newOrder, preferredTime: e.target.value || '' }),
                                                style: { border: 'none', background: 'transparent', color: isDark ? '#fff' : '#0f172a', width: '100%' }
                                            })}
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.input, styles.datePickerButton, !isDark && styles.inputLight]}
                                            onPress={() => setShowTimePicker(true)}
                                        >
                                            <Text style={[styles.datePickerText, !newOrder.preferredTime && styles.placeholderText, !isDark && styles.textDark]}>
                                                {newOrder.preferredTime || (TRANSLATIONS.selectOption || 'Select')}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {showDatePicker ? (
                                <DateTimePicker
                                    value={newOrder.preferredDate ? new Date(newOrder.preferredDate.split('.').reverse().join('-')) : new Date()}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                    onChange={onDateChange}
                                />
                            ) : null}
                            {showTimePicker ? (
                                <DateTimePicker
                                    value={newOrder.preferredTime ? new Date(`1970-01-01T${newOrder.preferredTime}:00`) : new Date()}
                                    mode="time"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={onTimeChange}
                                />
                            ) : null}
                        </View>
                    ) : null}
                </View>

                {/* Pricing */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.pricing || 'Pricing'}</Text>
                    <View style={styles.pricingRow}>
                        <TouchableOpacity
                            style={[styles.pricingBtn, newOrder.pricingType === 'unknown' && styles.pricingBtnActive, !isDark && newOrder.pricingType !== 'unknown' && styles.btnLight]}
                            onPress={() => setNewOrder({ ...newOrder, pricingType: 'unknown' })}
                        >
                            <Text style={styles.pricingBtnText}>{TRANSLATIONS.priceOpen || 'Open'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.pricingBtn, newOrder.pricingType === 'fixed' && styles.pricingBtnActive, !isDark && newOrder.pricingType !== 'fixed' && styles.btnLight]}
                            onPress={() => setNewOrder({ ...newOrder, pricingType: 'fixed' })}
                        >
                            <Text style={styles.pricingBtnText}>{TRANSLATIONS.pricingFixed || 'Fixed Price'}</Text>
                        </TouchableOpacity>
                    </View>
                    {newOrder.pricingType === 'fixed' ? (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                                style={[styles.input, !isDark && styles.inputLight, { flex: 1 }]}
                                placeholder={TRANSLATIONS.calloutFee || 'Call-out Fee'}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                keyboardType="numeric"
                                value={newOrder.calloutFee}
                                onChangeText={t => setNewOrder({ ...newOrder, calloutFee: sanitizeNumberInput(t) })}
                            />
                            <TextInput
                                style={[styles.input, !isDark && styles.inputLight, { flex: 1 }]}
                                placeholder={TRANSLATIONS.initialPrice || 'Initial Price'}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                keyboardType="numeric"
                                value={newOrder.initialPrice}
                                onChangeText={t => setNewOrder({ ...newOrder, initialPrice: sanitizeNumberInput(t) })}
                            />
                        </View>
                    ) : (
                        <TextInput
                            style={[styles.input, !isDark && styles.inputLight]}
                            placeholder={TRANSLATIONS.calloutFee || 'Call-out Fee'}
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            keyboardType="numeric"
                            value={newOrder.calloutFee}
                            onChangeText={t => setNewOrder({ ...newOrder, calloutFee: sanitizeNumberInput(t) })}
                        />
                    )}
                </View>

                {/* Internal Note */}
                <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                    <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.sectionNote || 'Internal Note'}</Text>
                    <TextInput
                        style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                        placeholder={TRANSLATIONS.createInternalNote || 'Internal Note'}
                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                        value={newOrder.dispatcherNote}
                        onChangeText={t => setNewOrder({ ...newOrder, dispatcherNote: t })}
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                    />
                </View>

                <View style={{ height: 120 }} />
            </View>
        );

        return (
            <View style={styles.createWrapper}>
                {renderHeader(TRANSLATIONS.createOrder || 'Create Order')}
                <ScrollView
                    style={styles.createContainer}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.createScrollContent}
                >
                    {creationSuccess ? renderSuccess() : renderForm()}
                </ScrollView>

                {!creationSuccess ? (
                    <View style={[styles.fixedBottomBar, !isDark && styles.fixedBottomBarLight]}>
                        <TouchableOpacity style={styles.confirmRow} onPress={() => setConfirmChecked(!confirmChecked)}>
                            <View style={[styles.checkbox, confirmChecked && styles.checkboxChecked]}>
                                {confirmChecked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                            </View>
                            <Text style={[styles.confirmLabel, !isDark && styles.textDark]}>{TRANSLATIONS.confirmDetails || 'Confirm Details'}</Text>
                        </TouchableOpacity>
                        <View style={styles.bottomBarButtons}>
                            <TouchableOpacity style={[styles.bottomClearBtn, !isDark && styles.btnLight]} onPress={clearCreateOrderForm}>
                                <Text style={[styles.bottomClearBtnText, !isDark && styles.textSecondary]}>{TRANSLATIONS.createClear || 'Clear'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.bottomPublishBtn,
                                    publishDisabled && styles.bottomPublishBtnDisabled,
                                    publishDisabled && styles.pointerEventsNone
                                ]}
                                onPress={publishDisabled ? undefined : handleCreateOrder}
                            >
                                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomPublishBtnText}>{TRANSLATIONS.createOrder || 'Create Order'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </View>
        );
    };
    const renderDetailsDrawer = () => {
        if (!detailsOrder) return null;
        const calloutValue = detailsOrder.callout_fee;
        const screenWidth = Dimensions.get('window').width;
        const drawerWidth = screenWidth <= 480 ? screenWidth : (screenWidth > 500 ? 400 : screenWidth * 0.85);
        const fullWidthDrawer = drawerWidth >= screenWidth;

        const drawerBody = (
            <View style={styles.drawerOverlay}>
                <TouchableOpacity
                    style={[styles.drawerBackdrop, fullWidthDrawer && styles.drawerBackdropHidden]}
                    onPress={() => { setDetailsOrder(null); setIsEditing(false); }}
                />
                <View style={[styles.drawerContent, !isDark && styles.drawerContentLight, { width: drawerWidth }]}>
                    <View style={[styles.drawerHeader, !isDark && styles.drawerHeaderLight]}>
                        <View>
                            <Text style={[styles.drawerTitle, !isDark && styles.textDark]}>
                                {formatOrderRefLabel(TRANSLATIONS.drawerTitle || 'Order #{0}', detailsOrder.id)}
                            </Text>
                            <Text style={styles.drawerDate}>
                                {detailsOrder.created_at ? new Date(detailsOrder.created_at).toLocaleString() : ''}
                            </Text>
                            <View
                                style={[
                                    styles.drawerStatusBadge,
                                    {
                                        backgroundColor: STATUS_COLORS[detailsOrder.status] || '#64748b',
                                        marginTop: 8,
                                        alignSelf: 'flex-start',
                                    },
                                ]}
                            >
                                <Text style={styles.drawerStatusText}>{getOrderStatusLabel(detailsOrder.status, t)}</Text>
                            </View>
                        </View>
                        <View style={styles.drawerActions}>
                            <TouchableOpacity
                                style={[styles.editBtn, isEditing && styles.editBtnActive]}
                                onPress={() => {
                                    if (isEditing) {
                                        setIsEditing(false);
                                    } else {
                                        setEditForm({
                                            ...detailsOrder,
                                            client_name: detailsOrder.client?.full_name || detailsOrder.client_name || '',
                                            client_phone: detailsOrder.client?.phone || detailsOrder.client_phone || '',
                                            area: detailsOrder.area || '',
                                            full_address: detailsOrder.full_address || '',
                                            orientir: detailsOrder.orientir || '',
                                            problem_description: detailsOrder.problem_description || '',
                                            initial_price: detailsOrder.initial_price ?? '',
                                            final_price: detailsOrder.final_price ?? '',
                                            callout_fee: detailsOrder.callout_fee ?? '',
                                            dispatcher_note: detailsOrder.dispatcher_note || '',
                                        });
                                        setIsEditing(true);
                                    }
                                }}
                            >
                                <Text style={[styles.editBtnText, isEditing && styles.editBtnTextActive]}>
                                    {isEditing ? (TRANSLATIONS.btnCancelEdit || TRANSLATIONS.cancel || 'Cancel') : (TRANSLATIONS.btnEdit || TRANSLATIONS.edit || 'Edit')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { setDetailsOrder(null); setIsEditing(false); }} style={{ padding: 8, marginLeft: 8 }}>
                                <Ionicons name="close" size={20} color={isDark ? '#cbd5e1' : '#0f172a'} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView style={styles.drawerBody}>
                        {detailsOrder.status === 'completed' && (
                            <View style={styles.drawerSection}>
                                <TouchableOpacity
                                    style={styles.drawerBtn}
                                    onPress={() => {
                                        setPaymentOrder(detailsOrder);
                                        setPaymentData(buildPaymentConfirmationData(detailsOrder));
                                        setShowPaymentModal(true);
                                    }}
                                >
                                    <Text style={styles.drawerBtnText}>{TRANSLATIONS.confirmPayment || 'Confirm Payment'}</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {isEditing ? (
                            <View style={styles.editSection}>
                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.clientName || 'Client Name'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={editForm.client_name || ''}
                                    onChangeText={t => setEditForm({ ...editForm, client_name: t })}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.clientPhone || 'Client Phone'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={editForm.client_phone || ''}
                                    onChangeText={t => setEditForm({ ...editForm, client_phone: t })}
                                    keyboardType="phone-pad"
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.createDistrict || 'District'}</Text>
                                <TouchableOpacity
                                    style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, !isDark && styles.inputLight]}
                                    onPress={openEditDistrictPicker}
                                >
                                    <Text style={[styles.pickerBtnText, !editForm.area && styles.placeholderText, !isDark && styles.textDark]}>
                                        {editForm.area ? (districts.find(d => d.id === editForm.area)?.label || editForm.area) : (TRANSLATIONS.selectOption || 'Select')}
                                    </Text>
                                    <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                                </TouchableOpacity>

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.address || TRANSLATIONS.fullAddressRequired || 'Full Address'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={editForm.full_address || ''}
                                    onChangeText={t => setEditForm({ ...editForm, full_address: t })}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.createOrientir || 'Landmark/Orientir'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={editForm.orientir || ''}
                                    onChangeText={t => setEditForm({ ...editForm, orientir: t })}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    placeholder={TRANSLATIONS.orientirPlaceholder || 'e.g. Near Beta Stores'}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.description || TRANSLATIONS.problemSection || 'Problem'}</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                                    value={editForm.problem_description || ''}
                                    onChangeText={t => setEditForm({ ...editForm, problem_description: t })}
                                    multiline
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.calloutFee || 'Call-out Fee'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={String(editForm.callout_fee ?? '')}
                                    onChangeText={t => setEditForm({ ...editForm, callout_fee: sanitizeNumberInput(t) })}
                                    keyboardType="numeric"
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.initialPrice || 'Initial Price'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    value={String(editForm.initial_price ?? '')}
                                    onChangeText={t => setEditForm({ ...editForm, initial_price: sanitizeNumberInput(t) })}
                                    keyboardType="numeric"
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                {['completed', 'confirmed'].includes(detailsOrder?.status) && (
                                    <>
                                        <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.labelFinal || 'Final Price'}</Text>
                                        <TextInput
                                            style={[styles.input, !isDark && styles.inputLight]}
                                            value={String(editForm.final_price ?? '')}
                                            onChangeText={t => setEditForm({ ...editForm, final_price: sanitizeNumberInput(t) })}
                                            keyboardType="numeric"
                                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        />
                                    </>
                                )}

                                <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS.sectionNote || 'Internal Note'}</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                                    value={editForm.dispatcher_note || ''}
                                    onChangeText={t => setEditForm({ ...editForm, dispatcher_note: t })}
                                    multiline
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />

                                {(detailsOrder?.master_id || detailsOrder?.master) && (
                                    <View style={styles.editActionRow}>
                                        <TouchableOpacity
                                            style={[styles.editActionBtn, styles.editActionPrimary]}
                                            onPress={() => openAssignModalFromQueue(detailsOrder)}
                                        >
                                            <Text style={styles.editActionText}>{TRANSLATIONS.reassignMaster || TRANSLATIONS.actionAssign || 'Assign'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.editActionBtn, styles.editActionDanger]}
                                            onPress={() => handleUnassignMaster(detailsOrder.id)}
                                        >
                                            <Text style={styles.editActionText}>{TRANSLATIONS.removeMaster || 'Remove Master'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[styles.saveEditBtn, actionLoading && styles.pointerEventsNone]}
                                    onPress={actionLoading ? undefined : handleSaveEdit}
                                >
                                    {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveEditText}>{TRANSLATIONS.saveChanges || 'Save Changes'}</Text>}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.drawerSections}>
                                <View style={styles.drawerSection}>
                                    <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionClient || 'Client'}</Text>
                                    <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                        <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.client?.full_name || detailsOrder.client_name || 'N/A'}</Text>
                                        <View style={styles.drawerRow}>
                                            <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.client?.phone || detailsOrder.client_phone || 'N/A'}</Text>
                                            <View style={styles.drawerRowBtns}>
                                                <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.client?.phone || detailsOrder.client_phone)} style={styles.drawerIconBtn}>
                                                    <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCopy || 'Copy'}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${detailsOrder.client?.phone || detailsOrder.client_phone}`)} style={styles.drawerIconBtn}>
                                                    <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCall || 'Call'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                        <View style={styles.drawerRow}>
                                            <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.full_address || '-'}</Text>
                                            <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.full_address)} style={styles.drawerIconBtn}>
                                                <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCopy || 'Copy'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                {!!detailsOrder.orientir && (
                                    <View style={styles.drawerRow}>
                                        <Text style={[styles.drawerRowText, !isDark && styles.textSecondary, { fontStyle: 'italic' }]}> {TRANSLATIONS.labelOrientir || 'Landmark:'} {detailsOrder.orientir}</Text>
                                    </View>
                                )}
                                    </View>
                                </View>

                                <View style={styles.drawerSection}>
                                    <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionMaster || 'Master'}</Text>
                                    <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                        {detailsOrder.master ? (
                                            <>
                                                <View style={styles.masterHeaderRow}>
                                                    <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.master.full_name}</Text>
                                                    <TouchableOpacity style={styles.masterDetailsBtn} onPress={() => openMasterDetails(detailsOrder.master)}>
                                                        <Text style={styles.masterDetailsBtnText}>{TRANSLATIONS.btnDetails || 'Details'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                <View style={styles.drawerRow}>
                                                    <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.master.phone}</Text>
                                                    <View style={styles.drawerRowBtns}>
                                                        <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.master.phone)} style={styles.drawerIconBtn}>
                                                            <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCopy || 'Copy'}</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${detailsOrder.master.phone}`)} style={styles.drawerIconBtn}>
                                                            <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCall || 'Call'}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </>
                                        ) : (
                                            <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>
                                                {TRANSLATIONS.unassigned || 'Unassigned'}
                                            </Text>
                                        )}
                                        {['placed', 'reopened'].includes(detailsOrder.status) && (
                                            <TouchableOpacity style={[styles.drawerBtn, { marginTop: 10 }]} onPress={() => openAssignModalFromQueue(detailsOrder)}>
                                                <Text style={styles.drawerBtnText}>{TRANSLATIONS.actionAssign || TRANSLATIONS.actionClaim || 'Assign'}</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>

                                <View style={styles.drawerSection}>
                                    <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionDispatcher || TRANSLATIONS.dispatcherRole || 'Dispatcher'}</Text>
                                    <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                        {(() => {
                                            const assignedDispatcherId = detailsOrder.assigned_dispatcher_id || detailsOrder.dispatcher_id;
                                            const assignedDispatcher = detailsOrder.assigned_dispatcher
                                                || detailsOrder.dispatcher
                                                || (dispatchers || []).find((d) => String(d?.id) === String(assignedDispatcherId || ''));
                                            const dispatcherName = assignedDispatcher?.full_name
                                                || (assignedDispatcherId
                                                    ? `${TRANSLATIONS.dispatcherRole || 'Dispatcher'} ${String(assignedDispatcherId).slice(0, 6)}`
                                                    : (TRANSLATIONS.unassigned || 'Unassigned'));
                                            const dispatcherPhone = assignedDispatcher?.phone || null;
                                            return (
                                                <>
                                                    <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{dispatcherName}</Text>
                                                    {dispatcherPhone && (
                                                        <View style={styles.drawerRow}>
                                                            <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{dispatcherPhone}</Text>
                                                            <View style={styles.drawerRowBtns}>
                                                                <TouchableOpacity onPress={() => copyToClipboard(dispatcherPhone)} style={styles.drawerIconBtn}>
                                                                    <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCopy || 'Copy'}</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${dispatcherPhone}`)} style={styles.drawerIconBtn}>
                                                                    <Text style={styles.drawerIconBtnText}>{TRANSLATIONS.btnCall || 'Call'}</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        </View>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        <TouchableOpacity style={styles.transferBtn} onPress={() => openTransferPicker(detailsOrder)}>
                                            <Text style={styles.transferText}>{TRANSLATIONS.transferOrder || 'Transfer Order'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.drawerSection}>
                                    <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionDetails || 'Order Details'}</Text>
                                    <Text style={[styles.drawerDesc, !isDark && styles.textSecondary]}>{detailsOrder.problem_description || '-'}</Text>
                                </View>

                                <View style={styles.drawerSection}>
                                    <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionFinancials || 'Financials'}</Text>
                                    <View style={styles.finRow}>
                                        <Text style={styles.finLabel}>{TRANSLATIONS.labelCallout || 'Call-out'}</Text>
                                        <Text style={[styles.finValue, !isDark && styles.textDark]}>{calloutValue ?? '-'}{calloutValue !== null && calloutValue !== undefined ? 'c' : ''}</Text>
                                    </View>
                                    <View style={styles.finRow}>
                                        <Text style={styles.finLabel}>{detailsOrder.final_price ? (TRANSLATIONS.labelFinal || 'Final') : (TRANSLATIONS.labelInitial || 'Initial')}</Text>
                                        <Text style={[styles.finValue, !isDark && styles.textDark, detailsOrder.final_price && { color: '#22c55e' }]}>
                                            {detailsOrder.final_price || detailsOrder.initial_price || (TRANSLATIONS.priceOpen || 'Open')}c
                                        </Text>
                                    </View>
                                </View>

                                {!!detailsOrder?.active_dispute && (
                                    <View style={styles.drawerSection}>
                                        <Text style={[styles.drawerSectionTitle, { color: '#ef4444' }]}>{TRANSLATIONS.disputes || 'Dispute'}</Text>
                                        <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                            {!!detailsOrder.active_dispute.reason && (
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>
                                                    {detailsOrder.active_dispute.reason}
                                                </Text>
                                            )}
                                            {!!detailsOrder.active_dispute.reportText && (
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary, { marginTop: 8 }]}>
                                                    {detailsOrder.active_dispute.reportText}
                                                </Text>
                                            )}
                                            {(detailsOrder.active_dispute.reportedFinalAmount !== null || detailsOrder.active_dispute.masterFinalAmount !== null) && (
                                                <View style={{ marginTop: 10 }}>
                                                    <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>
                                                        {TRANSLATIONS.labelFinal || 'Final'} ({TRANSLATIONS.dispatcherRole || TRANSLATIONS.partnerRole || 'Reporter'}): {detailsOrder.active_dispute.reportedFinalAmount !== null ? `${detailsOrder.active_dispute.reportedFinalAmount}c` : '-'}
                                                    </Text>
                                                    <Text style={[styles.drawerRowText, !isDark && styles.textSecondary, { marginTop: 4 }]}>
                                                        {TRANSLATIONS.labelFinal || 'Final'} ({TRANSLATIONS.masterRole || 'Master'}): {detailsOrder.active_dispute.masterFinalAmount !== null ? `${detailsOrder.active_dispute.masterFinalAmount}c` : '-'}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {!!detailsOrder.dispatcher_note && (
                                    <View style={styles.drawerSection}>
                                        <Text style={[styles.drawerSectionTitle, { color: '#f59e0b' }]}>{TRANSLATIONS.sectionNote || 'Internal Note'}</Text>
                                        <Text style={styles.drawerNote}>{detailsOrder.dispatcher_note}</Text>
                                    </View>
                                )}

                                {isReopenableStatus(detailsOrder.status) && (
                                    <TouchableOpacity style={styles.reopenBtn} onPress={() => handleReopenOrder(detailsOrder.id)}>
                                        <Text style={styles.reopenText}>{TRANSLATIONS.reopenOrder || 'Reopen Order'}</Text>
                                    </TouchableOpacity>
                                )}

                                {['placed', 'reopened', 'expired', 'canceled_by_master'].includes(detailsOrder.status) && (
                                    <TouchableOpacity style={styles.orderCancelBtn} onPress={() => handleCancelOrderAdmin(detailsOrder.id)}>
                                        <Text style={styles.orderCancelText}>{TRANSLATIONS.alertCancelTitle || 'Cancel Order'}</Text>
                                    </TouchableOpacity>
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


    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS.confirmPayment || 'Confirm Payment'}</Text>
                    <Text style={styles.modalSubtitle}>
                        {formatOrderRefLabel(TRANSLATIONS.modalOrderPrefix || 'Order #{0}', paymentOrder?.id)}
                    </Text>
                    <Text style={styles.modalAmount}>
                        {(paymentOrder?.final_price ?? paymentOrder?.initial_price ?? 'N/A')}c
                    </Text>
                    <Text style={styles.inputLabel}>{TRANSLATIONS.labelFinal || 'Final Amount'}</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={TRANSLATIONS.labelFinal || 'Final Amount'}
                        value={String(paymentData?.finalAmount ?? '')}
                        onChangeText={value => setPaymentData((prev) => ({ ...prev, finalAmount: sanitizeNumberInput(value) }))}
                        keyboardType="numeric"
                        placeholderTextColor="#64748b"
                    />

                    <Text style={styles.inputLabel}>{TRANSLATIONS.labelWorkDone || 'Work Done'}</Text>
                    <Text style={[styles.input, { minHeight: 56, textAlignVertical: 'top', paddingTop: 12 }]}>
                        {paymentOrder?.work_performed || paymentData?.workPerformed || '-'}
                    </Text>

                    <Text style={styles.inputLabel}>{TRANSLATIONS.labelTimeSpent || 'Time Spent (hours)'}</Text>
                    <Text style={[styles.input, { minHeight: 44, paddingTop: 12 }]}>
                        {paymentOrder?.hours_worked ?? paymentData?.hoursWorked ?? '-'}
                    </Text>

                    {!paymentOrder?.is_disputed && (
                        <>
                            <Text style={styles.inputLabel}>{TRANSLATIONS.labelReportReason || 'Report Reason'}</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                value={paymentData?.reportReason || ''}
                                onChangeText={value => setPaymentData((prev) => ({ ...prev, reportReason: value }))}
                                multiline
                                numberOfLines={3}
                                placeholder={TRANSLATIONS.labelReportReasonHint || 'Required only if reporting master'}
                                placeholderTextColor="#64748b"
                            />

                            <TouchableOpacity
                                style={[styles.modalCancel, { marginTop: 10, backgroundColor: '#dc2626' }]}
                                onPress={actionLoading ? undefined : handleReportMasterFromPaymentModal}
                                disabled={actionLoading}
                            >
                                <Text style={styles.modalCancelText}>{TRANSLATIONS.reportMaster || 'Report Master'}</Text>
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
                            <Text style={styles.modalCancelText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalConfirm, actionLoading && styles.pointerEventsNone]}
                            onPress={actionLoading ? undefined : handleConfirmPaymentModal}
                        >
                            {actionLoading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.modalConfirmText}>
                                    {paymentOrder?.is_disputed
                                        ? (TRANSLATIONS.resolveDispute || 'Resolve Dispute')
                                        : (TRANSLATIONS.confirm || 'Confirm')}
                                </Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    const renderMasterDetailsModal = () => (
        <Modal visible={showMasterDetails} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.masterDetailsCard}>
                    <View style={styles.masterDetailsHeader}>
                        <Text style={styles.modalTitle}>{TRANSLATIONS.titleMasterDetails || 'Master Details'}</Text>
                        <TouchableOpacity onPress={closeMasterDetails}>
                            <Ionicons name="close" size={20} color={isDark ? '#cbd5e1' : '#334155'} />
                        </TouchableOpacity>
                    </View>
                    {masterDetailsLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <View>
                            <Text style={styles.masterDetailsName}>
                                {masterDetails?.summary?.fullName || masterDetails?.profile?.full_name || '-'}
                            </Text>
                            <Text style={styles.masterDetailsSub}>
                                {masterDetails?.summary?.phone || masterDetails?.profile?.phone || '-'}
                            </Text>
                            <View style={styles.masterDetailsRow}>
                                <Text style={styles.masterDetailsLabel}>{TRANSLATIONS.prepaidBalance || 'Balance'}</Text>
                                <Text style={styles.masterDetailsValue}>{masterDetails?.summary?.prepaidBalance ?? 0}c</Text>
                            </View>
                            <View style={styles.masterDetailsRow}>
                                <Text style={styles.masterDetailsLabel}>{TRANSLATIONS.labelJobs || 'Jobs'}</Text>
                                <Text style={styles.masterDetailsValue}>{masterDetails?.summary?.completedJobs ?? 0}</Text>
                            </View>
                            {masterDetails?.summary?.balanceBlocked && (
                                <Text style={styles.masterDetailsBlocked}>{TRANSLATIONS.balanceBlocked || 'Balance Blocked'}</Text>
                            )}
                            <View style={styles.masterDetailsSection}>
                                <Text style={styles.masterDetailsSectionTitle}>
                                    {TRANSLATIONS.topUpHistory || TRANSLATIONS.analyticsTopUpTotal || 'Top-up history'}
                                </Text>
                                {masterBalanceHistoryLoading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    (() => {
                                        const topUps = (masterBalanceHistory || []).filter(tx => ['top_up', 'initial_deposit'].includes(tx.transaction_type));
                                        if (!topUps.length) {
                                            return (
                                                <Text style={styles.masterDetailsEmpty}>
                                                    {TRANSLATIONS.emptyList || 'No top-ups yet'}
                                                </Text>
                                            );
                                        }
                                        return topUps.map(tx => (
                                            <View key={tx.id} style={styles.masterDetailsTxRow}>
                                                <View>
                                                    <Text style={styles.masterDetailsTxLabel}>
                                                        {tx.transaction_type === 'initial_deposit'
                                                            ? (TRANSLATIONS.initialDeposit || 'Initial deposit')
                                                            : (TRANSLATIONS.transactionTopUp || 'Top Up')}
                                                    </Text>
                                                    <Text style={styles.masterDetailsTxMeta}>
                                                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '-'}
                                                    </Text>
                                                </View>
                                                <Text style={styles.masterDetailsTxAmount}>
                                                    +{Number(tx.amount || 0).toFixed(0)}
                                                </Text>
                                            </View>
                                        ));
                                    })()
                                )}
                            </View>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );


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
                {activeTab === 'analytics' && renderAnalytics()}
                {activeTab === 'orders' && renderOrders()}
                {activeTab === 'disputes' && renderDisputes()}
                {activeTab === 'payouts' && renderPayouts()}
                {activeTab === 'people' && renderPeople()}
                {activeTab === 'create_order' && renderCreateOrder()}

                {activeTab === 'settings' && renderSettingsPage()}
            </View>

            {/* Ported Details Drawer */}
            {renderDetailsDrawer()}
            {renderPickerModal()}
            {renderPaymentModal()}
            {renderMasterDetailsModal()}

            {/* Force Assign Master Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showAssignModal}
                onRequestClose={() => {
                    setShowAssignModal(false);
                    setAssignOrderId(null);
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: 500 }]}>
                        <Text style={styles.modalTitle}>{TRANSLATIONS.forceAssignMaster || 'Force Assign Master'}</Text>
                        <Text style={{ color: '#94a3b8', marginBottom: 15 }}>
                            {TRANSLATIONS.selectMasterAssign || 'Select a master to assign this order to:'}
                        </Text>
                        <View style={styles.pickerSearchInputWrapper}>
                            <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                            <TextInput
                                style={styles.pickerSearchInput}
                                value={assignMasterSearchQuery}
                                onChangeText={setAssignMasterSearchQuery}
                                placeholder={TRANSLATIONS.placeholderSearch || 'Search by name or phone'}
                                placeholderTextColor="#64748b"
                                autoCorrect={false}
                                autoCapitalize="none"
                            />
                            {assignMasterSearchLoading ? (
                                <ActivityIndicator size="small" color="#64748b" />
                            ) : assignMasterSearchQuery ? (
                                <TouchableOpacity onPress={() => setAssignMasterSearchQuery('')} style={styles.searchClear}>
                                    <Ionicons name="close-circle" size={16} color="#64748b" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        <FlatList
                            style={{ maxHeight: 300 }}
                            data={availableMasters}
                            keyExtractor={(master, index) => String(master?.id || master?.master_id || index)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item: master }) => {
                                const masterId = master.id || master.master_id;
                                const activeJobs = master.active_jobs ?? master.active_orders ?? master.active_orders_count ?? master.current_orders ?? 0;
                                const maxJobs = master.max_active_jobs ?? master.max_jobs ?? master.jobs_limit ?? null;
                                const jobsLabel = maxJobs !== null && maxJobs !== undefined
                                    ? `${activeJobs}/${maxJobs}`
                                    : String(activeJobs);
                                return (
                                    <TouchableOpacity
                                        key={masterId || master.id}
                                        style={[styles.listItemCard, { marginBottom: 8 }]}
                                        onPress={() => handleForceAssignMaster(assignOrderId || detailsOrder?.id, masterId, master.full_name || master.name || 'Master')}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <View style={[styles.avatarCircle, { backgroundColor: master.is_verified ? '#22c55e' : '#64748b' }]}>
                                                <Text style={{ color: '#fff' }}>{master.full_name?.charAt(0)}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.itemTitle}>{master.full_name}</Text>
                                                <Text style={styles.itemSubtitle}>{master.phone || 'N/A'} | {(TRANSLATIONS.labelJobs || TRANSLATIONS.orders || 'Jobs')}: {jobsLabel}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={16} color="#64748b" />
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={(
                                <Text style={{ color: '#64748b', textAlign: 'center', paddingVertical: 20 }}>
                                    {assignMasterSearchLoading
                                        ? (TRANSLATIONS.loading || 'Loading...')
                                        : (TRANSLATIONS.noAvailableMasters || 'No available masters found')}
                                </Text>
                            )}
                        />
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#334155', marginTop: 16 }]}
                            onPress={() => {
                                setShowAssignModal(false);
                                setAssignOrderId(null);
                            }}
                        >
                            <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Balance Management Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showBalanceModal}
                onRequestClose={closeBalanceModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>
                            {balanceData.type === 'adjustment'
                                ? (TRANSLATIONS.deductBalance || 'Deduct Master Balance')
                                : (TRANSLATIONS.addMasterBalance || 'Add Master Balance')}
                        </Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            {TRANSLATIONS.master || 'Master'}: {selectedMaster?.full_name}
                        </Text>

                        <TextInput
                            style={[styles.input, !isDark && styles.inputLight]}
                            placeholder={TRANSLATIONS.amountSom || 'Amount (som)'}
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            keyboardType="numeric"
                            value={balanceData.amount}
                            onChangeText={(text) => setBalanceData({ ...balanceData, amount: text })}
                        />

                        <TextInput
                            style={[styles.input, { height: 60 }, !isDark && styles.inputLight]}
                            placeholder={TRANSLATIONS.notesOptional || 'Notes (optional)'}
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            multiline
                            value={balanceData.notes}
                            onChangeText={(text) => setBalanceData({ ...balanceData, notes: text })}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={closeBalanceModal}
                            >
                                <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, balanceData.type === 'adjustment' && { backgroundColor: '#dc2626' }]}
                                onPress={() => handleAddMasterBalance(selectedMaster?.id, balanceData.amount, balanceData.type, balanceData.notes)}
                                disabled={actionLoading || !balanceData.amount}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading
                                        ? (TRANSLATIONS.saving || 'Saving...')
                                        : (balanceData.type === 'adjustment'
                                            ? (TRANSLATIONS.deduct || 'Deduct')
                                            : (TRANSLATIONS.addBalance || 'Add Balance'))}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Person Details Drawer (Master/Dispatcher) */}
            <Modal visible={!!detailsPerson} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={isPersonSubSidebarOpen ? undefined : handleCloseDetailsDrawer}
                        disabled={isPersonSubSidebarOpen}
                        activeOpacity={1}
                    />
                    <View style={{ width: Math.min(500, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[styles.avatarCircle, { width: 48, height: 48, borderRadius: 24, backgroundColor: detailsPerson?.is_verified ? '#22c55e' : '#64748b' }]}>
                                    <Text style={{ color: '#fff', fontSize: 18 }}>{detailsPerson?.full_name?.charAt(0)}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{detailsPerson?.full_name}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: detailsPerson?.is_verified ? '#22c55e' : '#ef4444', alignSelf: 'flex-start', marginTop: 4, paddingVertical: 3, paddingHorizontal: 7 }]}>
                                        <Text style={[styles.statusText, { fontSize: 9 }]}>
                                            {detailsPerson?.is_verified ? (TRANSLATIONS.verified || 'VERIFIED') : (TRANSLATIONS.unverified || 'UNVERIFIED')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity onPress={handleCloseDetailsDrawer}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Contact Info - Editable when isEditingPerson */}
                            <View style={[styles.card, !isDark && styles.cardLight]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                        onPress={() => {
                                            if (isEditingPerson) return;
                                            setIsPersonalInfoExpanded((prev) => !prev);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons
                                            name={(isPersonalInfoExpanded || isEditingPerson) ? 'chevron-up' : 'chevron-down'}
                                            size={14}
                                            color="#94a3b8"
                                        />
                                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                                            {TRANSLATIONS.personalInfo || TRANSLATIONS.contactInfo || 'PERSONAL INFO'}
                                        </Text>
                                    </TouchableOpacity>
                                    {!isEditingPerson && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsPersonalInfoExpanded(true);
                                                    setIsEditingPerson(true);
                                                    setEditPersonData({ ...detailsPerson });
                                                    setEditPersonPhoneError('');
                                                }}
                                                style={[styles.miniActionBtn, {
                                                    minWidth: 86,
                                                    backgroundColor: 'rgba(59,130,246,0.18)',
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(59,130,246,0.35)',
                                                }]}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                    <Ionicons name="create-outline" size={12} color="#60a5fa" />
                                                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                        {TRANSLATIONS.edit || TRANSLATIONS.btnEdit || 'Edit'}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                                {(isEditingPerson || isPersonalInfoExpanded) ? (
                                    isEditingPerson ? (
                                    <View style={{ gap: 12 }}>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.fullName || 'Full Name'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.full_name || ''}
                                                onChangeText={(text) => setEditPersonData({ ...editPersonData, full_name: text })}
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.phone || 'Phone'}</Text>
                                            <TextInput
                                                style={[styles.input, editPersonPhoneError && styles.inputError, !isDark && styles.inputLight]}
                                                value={editPersonData.phone || ''}
                                                onChangeText={handleEditPersonPhoneChange}
                                                onBlur={handleEditPersonPhoneBlur}
                                                keyboardType="phone-pad"
                                                placeholderTextColor="#64748b"
                                            />
                                            {editPersonPhoneError ? <Text style={styles.errorText}>{editPersonPhoneError}</Text> : null}
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.email || 'Email'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.email || ''}
                                                onChangeText={(text) => setEditPersonData((prev) => ({ ...prev, email: text }))}
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        {detailsPerson?.type === 'master' && (
                                            <>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.serviceArea || 'Service Area'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={editPersonData.service_area || ''}
                                                        onChangeText={(text) => setEditPersonData((prev) => ({ ...prev, service_area: text }))}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxActiveJobs || 'Max Active Jobs'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={String(editPersonData.max_active_jobs ?? '')}
                                                        onChangeText={(text) => setEditPersonData((prev) => ({ ...prev, max_active_jobs: text.replace(/\D/g, '') }))}
                                                        keyboardType="numeric"
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxActiveJobs)}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxImmediateOrders || 'Max Immediate Orders'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={String(editPersonData.max_immediate_orders ?? '')}
                                                        onChangeText={(text) => setEditPersonData((prev) => ({ ...prev, max_immediate_orders: text.replace(/\D/g, '') }))}
                                                        keyboardType="numeric"
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxImmediateOrders)}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxPendingConfirmation || 'Max Pending Confirmation'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={String(editPersonData.max_pending_confirmation ?? '')}
                                                        onChangeText={(text) => setEditPersonData((prev) => ({ ...prev, max_pending_confirmation: text.replace(/\D/g, '') }))}
                                                        keyboardType="numeric"
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxPendingConfirmation)}
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
                                                <Text style={styles.actionButtonText}>{actionLoading ? (TRANSLATIONS.saving || 'Saving...') : (TRANSLATIONS.saveChanges || 'Save Changes')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                onPress={() => { setIsEditingPerson(false); setEditPersonPhoneError(''); }}
                                            >
                                                <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    ) : (
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.fullName || 'Full Name'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>{detailsPerson?.full_name || 'N/A'}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.phone || 'Phone'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.phone || 'N/A'}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.email || 'Email'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>{detailsPerson?.email || 'N/A'}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.created || 'Created'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                    {detailsPerson?.created_at ? new Date(detailsPerson.created_at).toLocaleDateString() : 'N/A'}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.lastLogin || 'Last Login'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                    {detailsPerson?.last_login_at ? formatDateTimeLabel(detailsPerson.last_login_at) : (TRANSLATIONS.never || TRANSLATIONS.noData || 'No login data')}
                                                </Text>
                                            </View>
                                        </View>
                                    )
                                ) : (
                                    <TouchableOpacity
                                        style={{ paddingVertical: 4 }}
                                        onPress={() => setIsPersonalInfoExpanded(true)}
                                    >
                                        <Text style={{ color: '#64748b', fontSize: 11 }}>
                                            {TRANSLATIONS.tapViewDetails || 'Tap to view details'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Master-specific info */}
                            {detailsPerson?.type === 'master' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                void openTopUpHistory(detailsPerson);
                                            }}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
                                        >
                                            <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.financials || 'FINANCIALS'}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ color: '#64748b', fontSize: 11 }}>{TRANSLATIONS.tapViewDetails || 'Tap to view details'}</Text>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                            </View>
                                        </TouchableOpacity>

                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.balance || 'Balance:'}</Text>
                                                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                                                    <Text style={{ color: (detailsPerson?.prepaid_balance || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700' }}>
                                                        {detailsPerson?.prepaid_balance || 0} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        <TouchableOpacity
                                                            style={[styles.miniActionBtn, { minWidth: 74, backgroundColor: 'rgba(59,130,246,0.18)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)' }]}
                                                            onPress={() => openMasterBalanceModal(detailsPerson, 'top_up')}
                                                            disabled={actionLoading}
                                                        >
                                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                                {TRANSLATIONS.topUp || 'TOP UP'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={[styles.miniActionBtn, { minWidth: 74, backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' }]}
                                                            onPress={() => openMasterBalanceModal(detailsPerson, 'adjustment')}
                                                            disabled={actionLoading}
                                                        >
                                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#ef4444' }}>
                                                                {TRANSLATIONS.deduct || 'DEDUCT'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.initialDeposit || 'Initial Deposit:'}</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                    {detailsPerson?.initial_deposit || 0} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <TouchableOpacity
                                                activeOpacity={0.85}
                                                onPress={() => {
                                                    void openOrderHistory(detailsPerson);
                                                }}
                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                            >
                                                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.performance || 'PERFORMANCE'}</Text>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                            </TouchableOpacity>
                                            {!isEditingMasterPerformance && (
                                                <TouchableOpacity
                                                    onPress={() => openMasterPerformanceEditor(detailsPerson)}
                                                    style={[styles.miniActionBtn, { minWidth: 86, backgroundColor: 'rgba(59,130,246,0.18)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)' }]}
                                                    disabled={actionLoading}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                        <Ionicons name="create-outline" size={12} color="#60a5fa" />
                                                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                            {TRANSLATIONS.edit || TRANSLATIONS.btnEdit || 'Edit'}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {isEditingMasterPerformance ? (
                                            <View style={{ gap: 12 }}>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxActiveJobs || 'Max Active Jobs'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={masterPerformanceData.max_active_jobs}
                                                        onChangeText={(text) => setMasterPerformanceData((prev) => ({ ...prev, max_active_jobs: text.replace(/\D/g, '') }))}
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxActiveJobs)}
                                                        placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxImmediateOrders || 'Max Immediate Orders'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={masterPerformanceData.max_immediate_orders}
                                                        onChangeText={(text) => setMasterPerformanceData((prev) => ({ ...prev, max_immediate_orders: text.replace(/\D/g, '') }))}
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxImmediateOrders)}
                                                        placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxPendingConfirmation || 'Max Pending Confirmation'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={masterPerformanceData.max_pending_confirmation}
                                                        onChangeText={(text) => setMasterPerformanceData((prev) => ({ ...prev, max_pending_confirmation: text.replace(/\D/g, '') }))}
                                                        placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxPendingConfirmation)}
                                                        placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                                    />
                                                </View>
                                                <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                    {TRANSLATIONS.calculatedAuto || 'Current state values are calculated automatically.'}
                                                </Text>
                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, { backgroundColor: '#22c55e', flex: 1 }]}
                                                        onPress={handleSaveMasterPerformance}
                                                        disabled={actionLoading}
                                                    >
                                                        <Text style={styles.actionButtonText}>
                                                            {actionLoading ? (TRANSLATIONS.saving || 'Saving...') : (TRANSLATIONS.saveChanges || 'Save Changes')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                        onPress={closeMasterPerformanceEditor}
                                                    >
                                                        <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                activeOpacity={0.85}
                                                onPress={() => {
                                                    void openOrderHistory(detailsPerson);
                                                }}
                                            >
                                                <View style={{ gap: 8 }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.currentState || 'Current state:'}</Text>
                                                        <Text style={{ color: masterCurrentActivity?.activeCount > 0 ? '#22c55e' : (isDark ? '#fff' : '#0f172a'), fontWeight: '600' }}>
                                                            {masterCurrentActivity?.stateLabel || (TRANSLATIONS.noData || 'N/A')}
                                                        </Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.activeJobs || 'Active jobs now:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{masterCurrentActivity?.activeCount ?? 0}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.awaitingPayment || 'Awaiting payment:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{masterCurrentActivity?.awaitingPaymentCount ?? 0}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.reopened || 'Reopened:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{masterCurrentActivity?.reopenedCount ?? 0}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.latestStatus || 'Latest status:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                            {masterCurrentActivity?.latestStatusLabel || (TRANSLATIONS.noData || 'N/A')}
                                                        </Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.lastActivity || 'Last activity:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                            {masterCurrentActivity?.latestAtLabel || (TRANSLATIONS.noData || 'N/A')}
                                                        </Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.maxActiveJobs || 'Max active jobs:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.max_active_jobs ?? platformDefaultLimits.maxActiveJobs}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.maxImmediateOrders || 'Max immediate orders:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.max_immediate_orders ?? platformDefaultLimits.maxImmediateOrders}</Text>
                                                    </View>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                        <Text style={{ color: '#64748b' }}>{TRANSLATIONS.maxPendingConfirmation || 'Max pending confirmation:'}</Text>
                                                        <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.max_pending_confirmation ?? platformDefaultLimits.maxPendingConfirmation}</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {/* Master Actions (bottom only) */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_verified ? '#d97706' : '#16a34a' }]}
                                            onPress={() => { handleVerifyMaster(detailsPerson?.id, detailsPerson?.is_verified); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons
                                                    name={detailsPerson?.is_verified ? 'shield-outline' : 'shield-checkmark-outline'}
                                                    size={16}
                                                    color="#fff"
                                                />
                                                <Text style={styles.actionButtonText}>
                                                    {detailsPerson?.is_verified ? (TRANSLATIONS.unverifyMaster || 'Unverify Master') : (TRANSLATIONS.verifyMaster || 'Verify Master')}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#475569' }]}
                                            onPress={() => { setPasswordResetTarget(detailsPerson); setShowPasswordResetModal(true); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="key" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.resetPassword || 'Reset Password'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#be123c', borderWidth: 1, borderColor: '#e11d48' }]}
                                            onPress={() => handleDeleteUser(detailsPerson, 'master')}
                                            disabled={actionLoading}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="trash-outline" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.deleteUser || TRANSLATIONS.delete || 'Delete User'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Dispatcher-specific info */}
                            {detailsPerson?.type === 'dispatcher' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                void openOrderHistory(detailsPerson);
                                            }}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
                                        >
                                            <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.activity || TRANSLATIONS.performance || 'ACTIVITY'}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ color: '#64748b', fontSize: 11 }}>{TRANSLATIONS.tapViewDetails || 'Tap to view details'}</Text>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                void openOrderHistory(detailsPerson);
                                            }}
                                        >
                                            <View style={{ gap: 8 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.currentState || 'Current state:'}</Text>
                                                    <Text style={{ color: dispatcherCurrentActivity?.activeCount > 0 ? '#22c55e' : (isDark ? '#fff' : '#0f172a'), fontWeight: '600' }}>
                                                        {dispatcherCurrentActivity?.stateLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.activeOrders || 'Active orders now:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{dispatcherCurrentActivity?.activeCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.awaitingPayment || 'Awaiting payment:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{dispatcherCurrentActivity?.awaitingPaymentCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.reopened || 'Reopened:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{dispatcherCurrentActivity?.reopenedCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.latestStatus || 'Latest status:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                        {dispatcherCurrentActivity?.latestStatusLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.lastActivity || 'Last activity:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                        {dispatcherCurrentActivity?.latestAtLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Dispatcher Actions */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_verified ? '#d97706' : '#16a34a' }]}
                                            onPress={() => { handleVerifyDispatcher(detailsPerson?.id, detailsPerson?.is_verified); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons
                                                    name={detailsPerson?.is_verified ? 'shield-outline' : 'shield-checkmark-outline'}
                                                    size={16}
                                                    color="#fff"
                                                />
                                                <Text style={styles.actionButtonText}>
                                                    {detailsPerson?.is_verified
                                                        ? (TRANSLATIONS.unverify || 'Unverify')
                                                        : (TRANSLATIONS.verify || 'Verify')}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#475569' }]}
                                            onPress={() => { setPasswordResetTarget(detailsPerson); setShowPasswordResetModal(true); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="key" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.resetPassword || 'Reset Password'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#be123c', borderWidth: 1, borderColor: '#e11d48' }]}
                                            onPress={() => handleDeleteUser(detailsPerson, 'dispatcher')}
                                            disabled={actionLoading}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="trash-outline" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.deleteUser || TRANSLATIONS.delete || 'Delete User'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Partner-specific info */}
                            {detailsPerson?.type === 'partner' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                                            <TouchableOpacity
                                                activeOpacity={0.85}
                                                onPress={() => {
                                                    if (isEditingPartnerTerms || isEditingPartnerBalance) return;
                                                    setIsPartnerFinanceExpanded((prev) => !prev);
                                                }}
                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
                                            >
                                                <Ionicons
                                                    name={isPartnerFinanceExpanded ? 'chevron-up' : 'chevron-down'}
                                                    size={14}
                                                    color="#64748b"
                                                />
                                                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.financials || 'FINANCIALS'}</Text>
                                            </TouchableOpacity>
                                            {!isEditingPartnerTerms && !isEditingPartnerBalance && (
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <TouchableOpacity
                                                        onPress={handleOpenPartnerTermsEditor}
                                                        style={[styles.miniActionBtn, { minWidth: 92, backgroundColor: 'rgba(59,130,246,0.18)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)' }]}
                                                        disabled={actionLoading}
                                                    >
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                            <Ionicons name="create-outline" size={12} color="#60a5fa" />
                                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                                {TRANSLATIONS.edit || TRANSLATIONS.btnEdit || 'Edit'}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => handleOpenPartnerBalanceEditor('top_up')}
                                                        style={[styles.miniActionBtn, { minWidth: 92, backgroundColor: 'rgba(34,197,94,0.16)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' }]}
                                                        disabled={actionLoading}
                                                    >
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                            <Ionicons name="wallet-outline" size={12} color="#22c55e" />
                                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#22c55e' }}>
                                                                {TRANSLATIONS.balance || 'Balance'}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                        {isPartnerFinanceExpanded ? (
                                            partnerFinanceLoading ? (
                                                <View style={{ gap: 8 }}>
                                                    {Array.from({ length: 4 }).map((_, idx) => (
                                                        <View
                                                            key={`partner-finance-inline-skeleton-${idx}`}
                                                            style={{ height: 14, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#e2e8f0' }}
                                                        />
                                                    ))}
                                                </View>
                                            ) : (
                                                <View style={{ gap: 8 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.balance || 'Balance:'}</Text>
                                                    <Text style={{ color: Number(partnerFinanceSummary?.balance ?? detailsPerson?.partner_balance ?? 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700' }}>
                                                        {Number(partnerFinanceSummary?.balance ?? detailsPerson?.partner_balance ?? 0).toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.commissionRate || 'Commission:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                        {(Number(detailsPerson?.partner_commission_rate || 0) * 100).toFixed(2)}%
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.partnerMinPayout || 'Min payout:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                        {Number(detailsPerson?.partner_min_payout ?? 50).toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.pendingRequests || 'Pending requests:'}</Text>
                                                    <Text style={{ color: partnerPendingRequestsCount > 0 ? '#f59e0b' : (isDark ? '#fff' : '#0f172a') }}>
                                                        {partnerPendingRequestsCount}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.currentRequest || 'Current request:'}</Text>
                                                    <Text style={{ color: partnerFinanceCurrentRequest ? '#f59e0b' : (isDark ? '#fff' : '#0f172a') }}>
                                                        {partnerFinanceCurrentRequest
                                                            ? `${Number(partnerFinanceCurrentRequest.requested_amount || 0).toFixed(2)} ${TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}`
                                                            : (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.partnerPayoutTotal || 'Total paid:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                        {Number(partnerFinanceSummary?.paidTotal || 0).toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.partnerPayoutRequested || 'Total requested:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>
                                                        {Number(partnerFinanceSummary?.requestedTotal || 0).toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                </View>
                                                </View>
                                            )
                                        ) : (
                                            <TouchableOpacity style={{ paddingVertical: 4 }} onPress={() => setIsPartnerFinanceExpanded(true)}>
                                                <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                    {TRANSLATIONS.tapViewDetails || 'Tap to view details'}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                        {isPartnerFinanceExpanded && isEditingPartnerTerms && (
                                            <View
                                                style={{
                                                    marginTop: 14,
                                                    paddingTop: 12,
                                                    borderTopWidth: 1,
                                                    borderTopColor: isDark ? '#334155' : '#e2e8f0',
                                                    gap: 10,
                                                }}
                                            >
                                                <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                                                    {TRANSLATIONS.settings || 'SETTINGS'} - {(TRANSLATIONS.edit || 'Edit').toUpperCase()}
                                                </Text>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.commissionRate || 'Commission (%)'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={partnerCommissionInput}
                                                        onChangeText={setPartnerCommissionInput}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.partnerMinPayout || 'Min payout (som)'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={partnerMinPayoutInput}
                                                        onChangeText={setPartnerMinPayoutInput}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, { backgroundColor: '#22c55e', flex: 1 }]}
                                                        onPress={handleSavePartnerTerms}
                                                        disabled={actionLoading}
                                                    >
                                                        <Text style={styles.actionButtonText}>
                                                            {actionLoading ? (TRANSLATIONS.saving || 'Saving...') : (TRANSLATIONS.saveChanges || 'Save Changes')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                        onPress={handleCancelPartnerTermsEditor}
                                                    >
                                                        <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>
                                                            {TRANSLATIONS.cancel || 'Cancel'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}
                                        {isPartnerFinanceExpanded && isEditingPartnerBalance && (
                                            <View
                                                style={{
                                                    marginTop: 14,
                                                    paddingTop: 12,
                                                    borderTopWidth: 1,
                                                    borderTopColor: isDark ? '#334155' : '#e2e8f0',
                                                    gap: 10,
                                                }}
                                            >
                                                <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                                                    {TRANSLATIONS.balance || 'BALANCE'} - {(TRANSLATIONS.edit || 'Edit').toUpperCase()}
                                                </Text>
                                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.miniActionBtn,
                                                            {
                                                                flex: 1,
                                                                minWidth: 0,
                                                                backgroundColor: partnerBalanceActionType === 'top_up' ? 'rgba(34,197,94,0.2)' : (isDark ? '#334155' : '#e2e8f0'),
                                                                borderWidth: 1,
                                                                borderColor: partnerBalanceActionType === 'top_up' ? 'rgba(34,197,94,0.45)' : (isDark ? '#475569' : '#cbd5e1'),
                                                            },
                                                        ]}
                                                        onPress={() => setPartnerBalanceActionType('top_up')}
                                                        disabled={actionLoading}
                                                    >
                                                        <Text style={{ fontSize: 10, fontWeight: '700', color: partnerBalanceActionType === 'top_up' ? '#22c55e' : '#94a3b8' }}>
                                                            {TRANSLATIONS.topUp || 'TOP UP'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.miniActionBtn,
                                                            {
                                                                flex: 1,
                                                                minWidth: 0,
                                                                backgroundColor: partnerBalanceActionType === 'deduct' ? 'rgba(239,68,68,0.2)' : (isDark ? '#334155' : '#e2e8f0'),
                                                                borderWidth: 1,
                                                                borderColor: partnerBalanceActionType === 'deduct' ? 'rgba(239,68,68,0.45)' : (isDark ? '#475569' : '#cbd5e1'),
                                                            },
                                                        ]}
                                                        onPress={() => setPartnerBalanceActionType('deduct')}
                                                        disabled={actionLoading}
                                                    >
                                                        <Text style={{ fontSize: 10, fontWeight: '700', color: partnerBalanceActionType === 'deduct' ? '#ef4444' : '#94a3b8' }}>
                                                            {TRANSLATIONS.deduct || 'DEDUCT'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.amountSom || 'Amount (som)'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        keyboardType="numeric"
                                                        value={partnerDeductAmount}
                                                        onChangeText={setPartnerDeductAmount}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.notesOptional || 'Reason (optional)'}</Text>
                                                    <TextInput
                                                        style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                                                        multiline
                                                        numberOfLines={3}
                                                        value={partnerDeductReason}
                                                        onChangeText={setPartnerDeductReason}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.actionButton,
                                                            {
                                                                backgroundColor: partnerBalanceActionType === 'deduct' ? '#dc2626' : '#16a34a',
                                                                flex: 1,
                                                            },
                                                        ]}
                                                        onPress={partnerBalanceActionType === 'deduct' ? handleDeductPartnerBalance : handleTopUpPartnerBalance}
                                                        disabled={actionLoading}
                                                    >
                                                        <Text style={styles.actionButtonText}>
                                                            {actionLoading
                                                                ? (TRANSLATIONS.processing || 'Processing...')
                                                                : (partnerBalanceActionType === 'deduct'
                                                                    ? (TRANSLATIONS.deduct || 'Deduct')
                                                                    : (TRANSLATIONS.topUp || 'Top Up'))}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                        onPress={handleCancelPartnerBalanceEditor}
                                                    >
                                                        <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>
                                                            {TRANSLATIONS.cancel || 'Cancel'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    {isPartnerFinanceExpanded && (
                                        <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                            <TouchableOpacity
                                                activeOpacity={0.85}
                                                onPress={openPartnerHistoryModal}
                                                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                                            >
                                                <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                                                    {TRANSLATIONS.partnerRequestsHistory || TRANSLATIONS.payouts || 'Payout history'}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                        {TRANSLATIONS.tapToEdit || TRANSLATIONS.tapViewDetails || 'Tap to view details'}
                                                    </Text>
                                                    <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                                </View>
                                            </TouchableOpacity>
                                            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.requests || 'Requests'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{partnerHistoryRequests.length}</Text>
                                            </View>
                                            <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.transactions || 'Transactions'}:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{partnerHistoryTransactions.length}</Text>
                                            </View>
                                        </View>
                                    )}

                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                void openOrderHistory(detailsPerson);
                                            }}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
                                        >
                                            <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.activity || TRANSLATIONS.performance || 'ACTIVITY'}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ color: '#64748b', fontSize: 11 }}>{TRANSLATIONS.tapViewDetails || 'Tap to view details'}</Text>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                void openOrderHistory(detailsPerson);
                                            }}
                                        >
                                            <View style={{ gap: 8 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.currentState || 'Current state:'}</Text>
                                                    <Text style={{ color: partnerCurrentActivity?.activeCount > 0 ? '#22c55e' : (isDark ? '#fff' : '#0f172a'), fontWeight: '600' }}>
                                                        {partnerCurrentActivity?.stateLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.activeOrders || 'Active orders now:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{partnerCurrentActivity?.activeCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.awaitingPayment || 'Awaiting payment:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{partnerCurrentActivity?.awaitingPaymentCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.reopened || 'Reopened:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{partnerCurrentActivity?.reopenedCount ?? 0}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.latestStatus || 'Latest status:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                        {partnerCurrentActivity?.latestStatusLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#64748b' }}>{TRANSLATIONS.lastActivity || 'Last activity:'}</Text>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', flexShrink: 1, textAlign: 'right' }}>
                                                        {partnerCurrentActivity?.latestAtLabel || (TRANSLATIONS.noData || 'N/A')}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_verified ? '#d97706' : '#16a34a' }]}
                                            onPress={() => handleVerifyPartner(detailsPerson?.id, detailsPerson?.is_verified)}
                                            disabled={actionLoading}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons
                                                    name={detailsPerson?.is_verified ? 'shield-outline' : 'shield-checkmark-outline'}
                                                    size={16}
                                                    color="#fff"
                                                />
                                                <Text style={styles.actionButtonText}>
                                                    {detailsPerson?.is_verified
                                                        ? (TRANSLATIONS.unverify || 'Unverify')
                                                        : (TRANSLATIONS.verify || 'Verify')}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#475569' }]}
                                            onPress={() => { setPasswordResetTarget(detailsPerson); setShowPasswordResetModal(true); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="key" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.resetPassword || 'Reset Password'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#be123c', borderWidth: 1, borderColor: '#e11d48' }]}
                                            onPress={() => handleDeleteUser(detailsPerson, 'partner')}
                                            disabled={actionLoading}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="trash-outline" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>{TRANSLATIONS.deleteUser || TRANSLATIONS.delete || 'Delete User'}</Text>
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
                onRequestClose={closeOrderHistoryModal}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={closeOrderHistoryModal} />
                    <View style={{ width: Math.min(500, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{TRANSLATIONS.sectionHistory || 'Order History'}</Text>
                                <Text style={{ color: '#64748b', marginTop: 4 }}>{selectedMaster?.full_name}</Text>
                            </View>
                            <TouchableOpacity onPress={closeOrderHistoryModal}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {orderHistoryLoading ? (
                                <View style={{ paddingVertical: 10 }}>
                                    {Array.from({ length: 5 }).map((_, idx) => (
                                        <View
                                            key={`history-skeleton-${idx}`}
                                            style={[
                                                styles.card,
                                                !isDark && styles.cardLight,
                                                { marginBottom: 10, padding: 16 }
                                            ]}
                                        >
                                            <View style={{ height: 12, width: '60%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6, marginBottom: 10 }} />
                                            <View style={{ height: 10, width: '40%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6, marginBottom: 14 }} />
                                            <View style={{ height: 10, width: '30%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6 }} />
                                        </View>
                                    ))}
                                </View>
                            ) : masterOrderHistory.length === 0 ? (
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
                                                setDetailsPerson(null);
                                                openOrderDetails(order);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{getServiceLabel(order.service_type, t)}</Text>
                                                    <Text style={styles.itemSubtitle}>{getAreaLabel(order.area) || 'N/A'}</Text>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 14 }}>
                                                        {order.final_price ?? order.initial_price ?? order.callout_fee ?? '-'} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                    <View style={[styles.statusBadge, { backgroundColor: statusColor, marginTop: 6 }]}>
                                                        <Text style={styles.statusText}>{getOrderStatusLabel(order.status, t)}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#e2e8f0' }}>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                                <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>{TRANSLATIONS.tapViewDetails || 'Tap to view details'}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Master Top-Up History Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showTopUpHistoryModal}
                onRequestClose={closeTopUpHistoryModal}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={closeTopUpHistoryModal} />
                    <View style={{ width: Math.min(500, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.topUpHistory || 'Top Up History'}
                                </Text>
                                <Text style={{ color: '#64748b', marginTop: 4 }}>{selectedMaster?.full_name}</Text>
                            </View>
                            <TouchableOpacity onPress={closeTopUpHistoryModal}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {topUpHistoryLoading ? (
                                <View style={{ paddingVertical: 10 }}>
                                    {Array.from({ length: 5 }).map((_, idx) => (
                                        <View
                                            key={`topup-skeleton-${idx}`}
                                            style={[
                                                styles.card,
                                                !isDark && styles.cardLight,
                                                { marginBottom: 10, padding: 16 }
                                            ]}
                                        >
                                            <View style={{ height: 12, width: '60%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6, marginBottom: 10 }} />
                                            <View style={{ height: 10, width: '40%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6, marginBottom: 14 }} />
                                            <View style={{ height: 10, width: '30%', backgroundColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 6 }} />
                                        </View>
                                    ))}
                                </View>
                            ) : topUpHistory.length === 0 ? (
                                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
                                    <Ionicons name="cash-outline" size={48} color="#64748b" />
                                    <Text style={{ color: '#64748b', marginTop: 12 }}>
                                        {TRANSLATIONS.emptyList || 'No balance updates yet'}
                                    </Text>
                                </View>
                            ) : (
                                topUpHistory.map((tx, idx) => {
                                    const label = tx.transaction_type === 'initial_deposit'
                                        ? (TRANSLATIONS.initialDeposit || 'Initial deposit')
                                        : tx.transaction_type === 'adjustment'
                                            ? (TRANSLATIONS.deduct || 'Deduct')
                                            : (TRANSLATIONS.transactionTopUp || 'Top Up');
                                    const txAmount = Number(tx.amount || 0);
                                    const isPositive = txAmount >= 0;
                                    return (
                                        <View
                                            key={tx.id || idx}
                                            style={[styles.card, !isDark && styles.cardLight, { marginBottom: 10 }]}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{label}</Text>
                                                    <Text style={styles.itemSubtitle}>{tx.notes || '-'}</Text>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'N/A'}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: isPositive ? '#22c55e' : '#ef4444', fontWeight: '700', fontSize: 14 }}>
                                                        {isPositive ? '+' : ''}{txAmount.toFixed(0)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                    </Text>
                                                    <Text style={{ color: '#64748b', fontSize: 11 }}>
                                                        {TRANSLATIONS.balance || 'Balance'}: {Number(tx.balance_after || 0).toFixed(0)}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Partner Payout History Sidebar */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showPartnerHistoryModal}
                onRequestClose={closePartnerHistoryModal}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={closePartnerHistoryModal} />
                    <View style={{ width: Math.min(540, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.partnerRequestsHistory || TRANSLATIONS.payouts || 'Payout history'}
                                </Text>
                                <Text style={{ color: '#64748b', marginTop: 4 }}>
                                    {detailsPerson?.full_name || '-'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={closePartnerHistoryModal}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={{ marginBottom: 10 }}>
                            <TextInput
                                style={[styles.input, !isDark && styles.inputLight]}
                                placeholder={TRANSLATIONS.placeholderSearch || 'Search'}
                                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                                value={partnerHistorySearchQuery}
                                onChangeText={setPartnerHistorySearchQuery}
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                            {[
                                { key: 'all', label: TRANSLATIONS.all || 'All' },
                                { key: 'requests', label: TRANSLATIONS.requests || 'Requests' },
                                { key: 'transactions', label: TRANSLATIONS.transactions || 'Transactions' },
                            ].map((filterOption) => {
                                const isActive = partnerHistoryFilter === filterOption.key;
                                return (
                                    <TouchableOpacity
                                        key={filterOption.key}
                                        onPress={() => setPartnerHistoryFilter(filterOption.key)}
                                        style={[
                                            styles.miniActionBtn,
                                            {
                                                minWidth: 0,
                                                paddingHorizontal: 10,
                                                backgroundColor: isActive
                                                    ? (isDark ? 'rgba(59,130,246,0.28)' : '#dbeafe')
                                                    : (isDark ? '#334155' : '#f1f5f9'),
                                                borderWidth: 1,
                                                borderColor: isActive
                                                    ? (isDark ? 'rgba(96,165,250,0.6)' : '#93c5fd')
                                                    : (isDark ? '#475569' : '#cbd5e1'),
                                            },
                                        ]}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? '#60a5fa' : '#94a3b8' }}>
                                            {String(filterOption.label).toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {partnerFinanceLoading ? (
                                <View style={{ gap: 8 }}>
                                    {Array.from({ length: 5 }).map((_, idx) => (
                                        <View
                                            key={`partner-history-modal-skeleton-${idx}`}
                                            style={{ height: 14, borderRadius: 6, backgroundColor: isDark ? '#334155' : '#e2e8f0' }}
                                        />
                                    ))}
                                </View>
                            ) : (
                                <View style={{ gap: 10, paddingBottom: 12 }}>
                                    {shouldShowPartnerRequests && (
                                        <>
                                            <Text style={{ color: '#64748b', fontSize: 11 }}>{TRANSLATIONS.requests || 'REQUESTS'}</Text>
                                            {filteredPartnerHistoryRequests.length === 0 ? (
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.noPayoutRequestsYet || TRANSLATIONS.noData || 'No payout requests yet'}</Text>
                                            ) : (
                                                filteredPartnerHistoryRequests.slice(0, partnerHistoryRequestsLimit).map((requestItem) => {
                                                    const status = String(requestItem?.status || 'requested').toLowerCase();
                                                    const statusColor = status === 'paid'
                                                        ? '#22c55e'
                                                        : status === 'rejected'
                                                            ? '#ef4444'
                                                            : '#f59e0b';
                                                    return (
                                                        <View
                                                            key={requestItem.id}
                                                            style={{
                                                                borderWidth: 1,
                                                                borderColor: isDark ? '#334155' : '#e2e8f0',
                                                                borderRadius: 12,
                                                                padding: 12,
                                                                gap: 8,
                                                            }}
                                                        >
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontWeight: '600' }}>
                                                                    {Number(requestItem?.requested_amount || 0).toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                                </Text>
                                                                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
                                                                    <Text style={[styles.statusText, { color: statusColor }]}>{getPayoutStatusLabel(status)}</Text>
                                                                </View>
                                                            </View>
                                                            <Text style={{ color: '#64748b', fontSize: 12 }}>
                                                                {requestItem?.created_at ? new Date(requestItem.created_at).toLocaleString() : 'N/A'}
                                                            </Text>
                                                            {!!requestItem?.admin_note && (
                                                                <Text style={{ color: '#64748b', fontSize: 12 }}>
                                                                    {TRANSLATIONS.note || 'Note'}: {requestItem.admin_note}
                                                                </Text>
                                                            )}
                                                            {status === 'requested' && (
                                                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                                                    <TouchableOpacity
                                                                        style={[styles.actionButton, { flex: 1, backgroundColor: '#16a34a' }]}
                                                                        onPress={() => handleProcessPartnerPayout(requestItem, 'paid')}
                                                                        disabled={actionLoading}
                                                                    >
                                                                        <Text style={styles.actionButtonText}>{TRANSLATIONS.markPaid || 'Mark paid'}</Text>
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity
                                                                        style={[styles.actionButton, { flex: 1, backgroundColor: '#dc2626' }]}
                                                                        onPress={() => handleProcessPartnerPayout(requestItem, 'rejected')}
                                                                        disabled={actionLoading}
                                                                    >
                                                                        <Text style={styles.actionButtonText}>{TRANSLATIONS.reject || 'Reject'}</Text>
                                                                    </TouchableOpacity>
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })
                                            )}
                                            {filteredPartnerHistoryRequests.length > partnerHistoryRequestsLimit && (
                                                <TouchableOpacity
                                                    style={[styles.miniActionBtn, { alignSelf: 'flex-start', marginTop: 4, backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}
                                                    onPress={() => setPartnerHistoryRequestsLimit((prev) => prev + PARTNER_HISTORY_PAGE_SIZE)}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                        {TRANSLATIONS.loadMore || 'Load more'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    )}

                                    {shouldShowPartnerTransactions && (
                                        <>
                                            <Text style={{ color: '#64748b', fontSize: 11 }}>{TRANSLATIONS.transactions || 'TRANSACTIONS'}</Text>
                                            {filteredPartnerHistoryTransactions.length === 0 ? (
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.noHistoryYet || TRANSLATIONS.noData || 'No history yet'}</Text>
                                            ) : (
                                                filteredPartnerHistoryTransactions.slice(0, partnerHistoryTransactionsLimit).map((txItem) => {
                                                    const txType = String(txItem?.transaction_type || '');
                                                    const txLabel = txType === 'commission_earned'
                                                        ? (TRANSLATIONS.partnerCommissionEarned || 'Commission earned')
                                                        : txType === 'manual_deduction'
                                                            ? (TRANSLATIONS.partnerManualDeduction || 'Manual deduction')
                                                            : txType === 'payout_paid'
                                                                ? (TRANSLATIONS.partnerPayoutPaid || 'Payout paid')
                                                                : txType === 'admin_adjustment'
                                                                    ? (TRANSLATIONS.adjustment || 'Adjustment')
                                                                    : txType;
                                                    const txAmount = Number(txItem?.amount || 0);
                                                    const isPositive = txAmount >= 0;
                                                    return (
                                                        <View
                                                            key={txItem.id}
                                                            style={{
                                                                borderWidth: 1,
                                                                borderColor: isDark ? '#334155' : '#e2e8f0',
                                                                borderRadius: 12,
                                                                padding: 12,
                                                                gap: 6,
                                                            }}
                                                        >
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontWeight: '600', flex: 1, marginRight: 12 }}>
                                                                    {txLabel}
                                                                </Text>
                                                                <Text style={{ color: isPositive ? '#22c55e' : '#ef4444', fontWeight: '700' }}>
                                                                    {isPositive ? '+' : ''}{txAmount.toFixed(2)} {TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}
                                                                </Text>
                                                            </View>
                                                            <Text style={{ color: '#64748b', fontSize: 12 }}>
                                                                {txItem?.created_at ? new Date(txItem.created_at).toLocaleString() : 'N/A'}
                                                            </Text>
                                                            {!!txItem?.notes && (
                                                                <Text style={{ color: '#64748b', fontSize: 12 }}>
                                                                    {txItem.notes}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    );
                                                })
                                            )}
                                            {filteredPartnerHistoryTransactions.length > partnerHistoryTransactionsLimit && (
                                                <TouchableOpacity
                                                    style={[styles.miniActionBtn, { alignSelf: 'flex-start', marginTop: 4, backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}
                                                    onPress={() => setPartnerHistoryTransactionsLimit((prev) => prev + PARTNER_HISTORY_PAGE_SIZE)}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#60a5fa' }}>
                                                        {TRANSLATIONS.loadMore || 'Load more'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', marginTop: 4 }]}
                                        onPress={closePartnerHistoryModal}
                                    >
                                        <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>
                                            {TRANSLATIONS.cancel || 'Cancel'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Add User Modal (Master/Dispatcher/Partner) */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showAddUserModal}
                onRequestClose={closeAddUserModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: 450 }, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>
                            {addUserRole === 'master'
                                ? (TRANSLATIONS.addMaster || 'Add New Master')
                                : addUserRole === 'partner'
                                    ? (TRANSLATIONS.addPartner || 'Add New Partner')
                                    : (TRANSLATIONS.addDispatcher || 'Add New Dispatcher')}
                        </Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            {addUserRole === 'master'
                                ? (TRANSLATIONS.createNewMasterAccount || 'Create a new master account')
                                : addUserRole === 'partner'
                                    ? (TRANSLATIONS.createNewPartnerAccount || 'Create a new partner account')
                                    : (TRANSLATIONS.createNewDispatcherAccount || 'Create a new dispatcher account')}
                        </Text>

                        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 12 }}>
                                {/* Email */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                                        {TRANSLATIONS.emailRequired || 'Email *'}
                                    </Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder="email@example.com"
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={newUserData.email}
                                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, email: text }))}
                                    />
                                </View>

                                {/* Password */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                                        {TRANSLATIONS.passwordRequired || 'Password *'}
                                    </Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder={TRANSLATIONS.minCharacters || 'Minimum 6 characters'}
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        secureTextEntry
                                        value={newUserData.password}
                                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, password: text }))}
                                    />
                                </View>

                                {/* Full Name */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                                        {TRANSLATIONS.fullNameRequired || 'Full Name *'}
                                    </Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder={TRANSLATIONS.placeholderFullName || 'John Doe'}
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        value={newUserData.full_name}
                                        onChangeText={(text) => setNewUserData((prev) => ({ ...prev, full_name: text }))}
                                    />
                                </View>

                                {/* Phone */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                                        {TRANSLATIONS.phoneOptional || TRANSLATIONS.phone || 'Phone'}
                                    </Text>
                                    <TextInput
                                        style={[styles.input, newUserPhoneError && styles.inputError, !isDark && styles.inputLight]}
                                        placeholder="+996..."
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        keyboardType="phone-pad"
                                        value={newUserData.phone}
                                        onChangeText={handleNewUserPhoneChange}
                                        onBlur={handleNewUserPhoneBlur}
                                    />
                                    {newUserPhoneError ? <Text style={styles.errorText}>{newUserPhoneError}</Text> : null}
                                </View>

                                {/* Master-specific fields */}
                                {addUserRole === 'master' && (
                                    <>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>
                                                {TRANSLATIONS.serviceAreaOptional || TRANSLATIONS.serviceArea || 'Service Area'}
                                            </Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder={TRANSLATIONS.placeholderServiceArea || TRANSLATIONS.placeholderArea || 'e.g. Bishkek, Leninsky district'}
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                value={newUserData.service_area}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, service_area: text }))}
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxActiveJobs || 'Max Active Jobs'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxActiveJobs)}
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.max_active_jobs}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, max_active_jobs: text.replace(/\D/g, '') }))}
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxImmediateOrders || 'Max Immediate Orders'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxImmediateOrders)}
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.max_immediate_orders}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, max_immediate_orders: text.replace(/\D/g, '') }))}
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.maxPendingConfirmation || 'Max Pending Confirmation'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder={getPlatformDefaultPlaceholder(platformDefaultLimits.maxPendingConfirmation)}
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.max_pending_confirmation}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, max_pending_confirmation: text.replace(/\D/g, '') }))}
                                            />
                                        </View>
                                    </>
                                )}
                                {addUserRole === 'partner' && (
                                    <>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.commissionRate || 'Commission (%)'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder="10"
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.partner_commission_rate}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, partner_commission_rate: sanitizeNumberInput(text) }))}
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.partnerMinPayout || 'Min payout (som)'}</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder="50"
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.partner_min_payout}
                                                onChangeText={(text) => setNewUserData((prev) => ({ ...prev, partner_min_payout: sanitizeNumberInput(text) }))}
                                            />
                                        </View>
                                    </>
                                )}
                            </View>
                        </ScrollView>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={closeAddUserModal}
                            >
                                <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, {
                                    backgroundColor:
                                        addUserRole === 'master'
                                            ? '#22c55e'
                                            : addUserRole === 'partner'
                                                ? '#0ea5e9'
                                                : '#3b82f6'
                                }]}
                                onPress={handleCreateUser}
                                disabled={actionLoading || !newUserData.email || !newUserData.password || !newUserData.full_name || Boolean(newUserPhoneError)}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading ? (TRANSLATIONS.creating || 'Creating...') : (
                                        addUserRole === 'master'
                                            ? (TRANSLATIONS.createMaster || 'Create Master')
                                            : addUserRole === 'partner'
                                                ? (TRANSLATIONS.createPartner || 'Create Partner')
                                                : (TRANSLATIONS.createDispatcher || 'Create Dispatcher')
                                    )}
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
                                <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>{TRANSLATIONS.resetPassword || 'Reset Password'}</Text>
                                <Text style={{ color: isDark ? '#64748b' : '#334155', fontSize: 12 }}>
                                    {passwordResetTarget?.full_name}
                                </Text>
                            </View>
                        </View>

                        <View style={{ backgroundColor: '#f59e0b15', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f59e0b' }}>
                            <Text style={{ color: '#f59e0b', fontSize: 12 }}>
                                ?? {TRANSLATIONS.resetPasswordWarning || "This action will immediately change the user's password. They will need to use the new password to login."}
                            </Text>
                        </View>

                        <View style={{ gap: 12 }}>
                            <View>
                                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.newPassword || 'New Password *'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    placeholder={TRANSLATIONS.minCharacters || 'Minimum 6 characters'}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    secureTextEntry
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                />
                            </View>
                            <View>
                                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.confirmPasswordLabel || 'Confirm Password *'}</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight, confirmPassword && newPassword !== confirmPassword && { borderColor: '#ef4444' }]}
                                    placeholder={TRANSLATIONS.reenterPassword || 'Re-enter password'}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    secureTextEntry
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{TRANSLATIONS.passwordsNotMatch || 'Passwords do not match'}</Text>
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
                                <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
                                onPress={handleResetPassword}
                                disabled={actionLoading || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading ? (TRANSLATIONS.resetting || 'Resetting...') : (TRANSLATIONS.resetPassword || 'Reset Password')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </LinearGradient >
    );
}
