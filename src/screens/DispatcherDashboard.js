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
import DateTimePicker from '@react-native-community/datetimepicker';
import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import { useToast } from '../contexts/ToastContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { STATUS_COLORS, getOrderStatusLabel, getServiceLabel, getTimeAgo } from '../utils/orderHelpers';
import { normalizeKyrgyzPhone, isValidKyrgyzPhone } from '../utils/phone';
const LOG_PREFIX = '[DispatcherDashboard]';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SERVICE_TYPES = [
    { id: 'plumbing', label: 'Plumbing' }, { id: 'electrician', label: 'Electrician' },
    { id: 'cleaning', label: 'Cleaning' }, { id: 'carpenter', label: 'Carpenter' },
    { id: 'repair', label: 'Repair' }, { id: 'installation', label: 'Installation' },
    { id: 'maintenance', label: 'Maintenance' }, { id: 'other', label: 'Other' },
];

// Status filter options
// Status filter options
const STATUS_OPTIONS = [
    { id: 'Active', label: 'statusActive' },
    { id: 'Payment', label: 'statusPayment' },
    { id: 'Confirmed', label: 'filterStatusConfirmed' },
    { id: 'Canceled', label: 'statusCanceled' },
];

// Urgency filter options
const URGENCY_OPTIONS = [
    { id: 'all', label: 'filterAllUrgency' },
    { id: 'emergency', label: 'urgencyEmergency' },
    { id: 'urgent', label: 'urgencyUrgent' },
    { id: 'planned', label: 'urgencyPlanned' },
];

const ATTENTION_FILTER_OPTIONS = [
    { id: 'All', label: 'issueAllIssues' },
    { id: 'Stuck', label: 'issueStuck' },
    { id: 'Disputed', label: 'issueDisputed' },
    { id: 'Payment', label: 'issueUnpaid' },
    { id: 'Canceled', label: 'issueCanceled' },
];

// Dispatcher filter options
const DISPATCHER_OPTIONS = [
    { id: 'all', label: 'filterAllOrders' },
    { id: 'me', label: 'filterMyOrders' },
];

// Sort options
const SORT_OPTIONS = [
    { id: 'newest', label: 'filterNewestFirst' },
    { id: 'oldest', label: 'filterOldestFirst' },
];

// Storage keys
const STORAGE_KEYS = { DRAFT: 'dispatcher_draft_order', RECENT_ADDR: 'dispatcher_recent_addresses' };

const INITIAL_ORDER_STATE = {
    clientName: '', clientPhone: '', pricingType: 'unknown', initialPrice: '', calloutFee: '',
    serviceType: 'repair', urgency: 'planned', problemDescription: '',
    area: '', fullAddress: '', orientir: '', preferredDate: '', preferredTime: '', dispatcherNote: '',
};

// Kyrgyzstan districts for autocomplete
const DISTRICT_OPTIONS = [
    'Leninsky', 'Oktyabrsky', 'Pervomaysky', 'Sverdlovsky',
    'Alamedin', 'Sokuluk', 'Ysyk-Ata', 'Jayil', 'Moskovsky'
];

// Generate unique ID for idempotency
const generateIdempotencyKey = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const sanitizeNumberInput = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;
};

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
    const { translations, language, cycleLanguage, t } = useLocalization();
    const TRANSLATIONS = translations;

    // User & Data
    const [user, setUser] = useState(route.params?.user || null);
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [recentAddresses, setRecentAddresses] = useState([]);
    const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES);
    const [districts, setDistricts] = useState([]);

    // UI States
    const [activeTab, setActiveTab] = useState('create');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDark, setIsDark] = useState(true); // Theme state
    const [actionLoading, setActionLoading] = useState(false);
    const [page, setPage] = useState(1); // Pagination state

    // Picker modal state
    const [pickerModal, setPickerModal] = useState({ visible: false, options: [], value: '', onChange: null, title: '' });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

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
    const [paymentOrder, setPaymentOrder] = useState(null); // Store order for payment modal
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTarget, setAssignTarget] = useState(null);
    const [showMasterDetails, setShowMasterDetails] = useState(false);
    const [masterDetails, setMasterDetails] = useState(null);
    const [masterDetailsLoading, setMasterDetailsLoading] = useState(false);

    // Create Order Form
    const [newOrder, setNewOrder] = useState(INITIAL_ORDER_STATE);
    const [phoneError, setPhoneError] = useState('');
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState(null);
    const [showRecentAddr, setShowRecentAddr] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
    const [platformSettings, setPlatformSettings] = useState(null); // Dynamic platform settings

    // ============================================
    // DATA LOADING
    // ============================================

    useEffect(() => {
        loadData();
        loadDraft();
        loadRecentAddresses();
        loadServiceTypes();
        loadDistricts();
        loadPlatformSettings(); // Fetch platform settings for callout fee default
    }, []);

    // Reload service types and districts when language changes
    useEffect(() => {
        loadServiceTypes();
        loadDistricts();
    }, [language]);

    // Set default callout fee when settings load
    useEffect(() => {
        if (platformSettings?.base_price && !newOrder.calloutFee) {
            setNewOrder(prev => ({ ...prev, calloutFee: String(platformSettings.base_price) }));
        }
    }, [platformSettings]);

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

    const loadServiceTypes = async () => {
        try {
            const types = await ordersService.getServiceTypes();
            if (types && types.length > 0) {
                // Use correct language field based on current language
                const labelField = language === 'ru' ? 'name_ru' : language === 'kg' ? 'name_kg' : 'name_en';
                setServiceTypes(types.map(t => ({
                    id: t.code,
                    label: t[labelField] || t.name_en // Fallback to English
                })));
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadServiceTypes error:`, error);
            // Keep fallback SERVICE_TYPES
        }
    };

    const loadDistricts = async () => {
        try {
            const data = await ordersService.getDistricts();
            if (data && data.length > 0) {
                const labelField = language === 'ru' ? 'name_ru' : language === 'kg' ? 'name_kg' : 'name_en';
                setDistricts(data.map(d => ({
                    id: d.code,
                    label: d[labelField] || d.name_en,
                    region: d.region
                })));
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadDistricts error:`, error);
        }
    };

    const loadPlatformSettings = async () => {
        try {
            const settings = await ordersService.getPlatformSettings();
            if (settings) {
                setPlatformSettings(settings);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadPlatformSettings error:`, error);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    const getAssignErrorMessage = (errorCode) => {
        if (!errorCode) return null;
        const map = {
            INVALID_STATUS: TRANSLATIONS[language].errorAssignInvalidStatus,
            MASTER_NOT_VERIFIED: TRANSLATIONS[language].errorAssignMasterNotVerified,
            MASTER_INACTIVE: TRANSLATIONS[language].errorAssignMasterInactive,
            MASTER_NOT_FOUND: TRANSLATIONS[language].errorAssignMasterNotFound,
            ORDER_NOT_FOUND: TRANSLATIONS[language].errorAssignOrderNotFound,
            UNAUTHORIZED: TRANSLATIONS[language].errorAssignUnauthorized
        };
        return map[errorCode] || null;
    };

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

    const needsActionOrders = useMemo(() => {
        const now = Date.now();
        return orders.filter(o => {
            if (o.is_disputed) return true;
            if (o.status === ORDER_STATUS.COMPLETED) return true;
            if (o.status === ORDER_STATUS.CANCELED_BY_CLIENT) return false;
            if (o.status === ORDER_STATUS.CANCELED_BY_MASTER) return true;
            if (o.status === ORDER_STATUS.PLACED && (now - new Date(o.created_at).getTime()) > 15 * 60000) return true;
            if (o.status === ORDER_STATUS.CLAIMED && (now - new Date(o.updated_at).getTime()) > 30 * 60000) return true;
            return false;
        });
    }, [orders]);

    const statusCounts = useMemo(() => {
        const counts = { Active: 0, Payment: 0, Confirmed: 0, Canceled: 0 };
        orders.forEach(o => {
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

    const filteredOrders = useMemo(() => {
        let res = [...orders];

        // Search
        if (searchQuery) {
            const qRaw = searchQuery.trim().toLowerCase();
            if (qRaw) {
                const q = qRaw.startsWith('#') ? qRaw.slice(1) : qRaw;
                const qDigits = q.replace(/\D/g, '');
                res = res.filter(o => {
                    const id = String(o.id || '').toLowerCase();
                    const idMatch = q.length <= 6 ? id.endsWith(q) : id.includes(q);
                    const clientName = o.client?.full_name?.toLowerCase() || '';
                    const masterName = o.master?.full_name?.toLowerCase() || '';
                    const fullAddress = o.full_address?.toLowerCase() || '';
                    const phoneRaw = String(o.client?.phone || o.client_phone || '');
                    const phoneDigits = phoneRaw.replace(/\D/g, '');
                    const phoneMatch = qDigits ? phoneDigits.includes(qDigits) : phoneRaw.includes(q);

                    return (
                        idMatch ||
                        clientName.includes(q) ||
                        masterName.includes(q) ||
                        fullAddress.includes(q) ||
                        phoneMatch
                    );
                });
            }
        }

        // Status tabs
        switch (statusFilter) {
            case 'Active':
                res = res.filter(o => [ORDER_STATUS.PLACED, ORDER_STATUS.REOPENED, ORDER_STATUS.CLAIMED, ORDER_STATUS.STARTED].includes(o.status));
                break;
            case 'Payment':
                res = res.filter(o => o.status === ORDER_STATUS.COMPLETED);
                break;
            case 'Confirmed':
                res = res.filter(o => o.status === ORDER_STATUS.CONFIRMED);
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
        if (!confirmChecked) { showToast?.(TRANSLATIONS[language].toastConfirmDetails, 'error'); return; }
        if (!newOrder.clientName?.trim()) {
            showToast?.(TRANSLATIONS[language].toastClientNameRequired || 'Client name is required', 'error'); return;
        }
        if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
            showToast?.(TRANSLATIONS[language].toastFillRequired, 'error'); return;
        }
        if (phoneError) { showToast?.(TRANSLATIONS[language].toastFixPhone, 'error'); return; }

        const parsedCallout = newOrder.calloutFee !== '' && newOrder.calloutFee !== null && newOrder.calloutFee !== undefined
            ? parseFloat(newOrder.calloutFee)
            : null;
        const calloutValue = !isNaN(parsedCallout) ? parsedCallout : null;
        const parsedInitial = newOrder.pricingType === 'fixed' && newOrder.initialPrice !== '' && newOrder.initialPrice !== null && newOrder.initialPrice !== undefined
            ? parseFloat(newOrder.initialPrice)
            : null;
        const initialValue = !isNaN(parsedInitial) ? parsedInitial : null;

        if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
            showToast?.(TRANSLATIONS[language].errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await ordersService.createOrderExtended({
                clientName: newOrder.clientName,
                clientPhone: newOrder.clientPhone,
                pricingType: newOrder.pricingType === 'fixed' ? 'fixed' : 'unknown',
                initialPrice: newOrder.pricingType === 'fixed' ? parseFloat(newOrder.initialPrice) || null : null,
                calloutFee: parseFloat(newOrder.calloutFee) || null,
                serviceType: newOrder.serviceType,
                urgency: newOrder.urgency,
                problemDescription: newOrder.problemDescription,
                area: newOrder.area,
                fullAddress: newOrder.fullAddress,
                orientir: newOrder.orientir || null,
                preferredDate: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : null,
                preferredTime: newOrder.preferredTime || null,
                dispatcherNote: newOrder.dispatcherNote || null,
            }, user.id);

            if (result.success) {
                showToast?.(TRANSLATIONS[language].toastOrderCreated || 'Order created!', 'success');
                await saveRecentAddress(newOrder.area, newOrder.fullAddress);
                await AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
                setCreationSuccess({ id: result.orderId });
                setConfirmChecked(false);
                await loadData();
            } else {
                showToast?.(TRANSLATIONS[language].toastOrderFailed || TRANSLATIONS[language].toastCreateFailed, 'error');
            }
        } catch (error) {
            showToast?.(TRANSLATIONS[language].toastCreateFailed, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePhoneBlur = () => {
        const normalized = normalizeKyrgyzPhone(newOrder.clientPhone);
        const nextValue = normalized || newOrder.clientPhone;
        setNewOrder(prev => ({ ...prev, clientPhone: nextValue }));
        setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? TRANSLATIONS[language].errorPhoneFormat : '');
    };

    // Paste phone from clipboard and auto-format
    const handlePastePhone = async () => {
        try {
            let text = '';
            // Use browser API for web, react-native API for mobile
            if (Platform.OS === 'web' && navigator?.clipboard) {
                text = await navigator.clipboard.readText();
            } else {
                text = await Clipboard.getString();
            }
            if (text) {
                const normalized = normalizeKyrgyzPhone(text);
                const nextValue = normalized || text;
                setNewOrder(prev => ({ ...prev, clientPhone: nextValue }));
                showToast?.(TRANSLATIONS[language].toastPasted, 'success');
                setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? TRANSLATIONS[language].errorPhoneFormat : '');
            } else {
                showToast?.(TRANSLATIONS[language].toastClipboardEmpty, 'info');
            }
        } catch (e) {
            console.log('Paste error:', e);
            showToast?.(TRANSLATIONS[language].toastPasteFailed, 'error');
        }
    };

    // Make phone call
    const handleCall = (phone) => {
        if (phone) {
            Linking.openURL(`tel:${phone}`);
        }
    };

    const handleConfirmPayment = async () => {
        if (!paymentData.method) { showToast?.(TRANSLATIONS[language].toastSelectPaymentMethod, 'error'); return; }
        if (paymentData.method === 'transfer' && !paymentData.proofUrl) {
            showToast?.(TRANSLATIONS[language].toastProofRequired, 'error'); return;
        }
        if (!paymentOrder?.id) { showToast?.(TRANSLATIONS[language].toastNoOrderSelected, 'error'); return; }

        setActionLoading(true);
        try {
            const result = await ordersService.confirmPayment(paymentOrder.id, user.id, {
                paymentMethod: paymentData.method, paymentProofUrl: paymentData.proofUrl || null
            });
            if (result.success) {
                showToast?.(TRANSLATIONS[language].toastPaymentConfirmed, 'success');
                setShowPaymentModal(false);
                setPaymentOrder(null);
                setPaymentData({ method: 'cash', proofUrl: '' });
                await loadData();
            } else { showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error'); }
        } catch (e) {
            console.error('Payment confirm error:', e);
            showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error');
        }
        finally { setActionLoading(false); }
    };

    const openAssignModal = (order) => {
        if (!order) return;
        setAssignTarget(order);
        setDetailsOrder(null);
        setShowAssignModal(true);
    };

    const handleAssignMaster = async (master) => {
        const targetId = assignTarget?.id || detailsOrder?.id;
        if (!targetId) {
            showToast?.(TRANSLATIONS[language].toastNoOrderSelected || 'No order selected', 'error');
            return;
        }
        const maxJobs = Number.isFinite(Number(master?.max_active_jobs)) ? Number(master.max_active_jobs) : null;
        const activeJobs = Number.isFinite(Number(master?.active_jobs)) ? Number(master.active_jobs) : 0;
        if (maxJobs !== null && activeJobs >= maxJobs) {
            showToast?.(TRANSLATIONS[language].errorMasterLimitReached || 'Master has reached the active jobs limit', 'error');
            return;
        }
        const msg = (TRANSLATIONS[language].alertAssignMsg || 'Assign {0}?').replace('{0}', master.full_name);

        const confirmAssign = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.forceAssignMaster(targetId, master.id, 'Dispatcher assignment');
                if (result.success) {
                    showToast?.(TRANSLATIONS[language].toastMasterAssigned, 'success');
                    setShowAssignModal(false);
                    setDetailsOrder(null);
                    setAssignTarget(null);
                    await loadData();
                } else {
                    const mapped = getAssignErrorMessage(result?.error);
                    showToast?.(mapped || TRANSLATIONS[language].toastAssignFail, 'error');
                }
            } catch (e) { showToast?.(TRANSLATIONS[language].toastAssignFail, 'error'); }
            finally { setActionLoading(false); }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(msg)) confirmAssign();
        } else {
            Alert.alert(TRANSLATIONS[language].alertAssignTitle, msg, [
                { text: TRANSLATIONS[language].cancel, style: 'cancel' },
                { text: TRANSLATIONS[language].alertAssignBtn, onPress: confirmAssign }
            ]);
        }
    };

    const openMasterDetails = async (master) => {
        if (!master?.id) {
            showToast?.(TRANSLATIONS[language].errorMasterDetailsUnavailable || 'Master details unavailable', 'error');
            return;
        }
        setShowMasterDetails(true);
        setMasterDetails({ profile: master, summary: null });
        setMasterDetailsLoading(true);
        const summary = await earningsService.getMasterFinancialSummary(master.id);
        setMasterDetails({ profile: master, summary });
        setMasterDetailsLoading(false);
    };

    const closeMasterDetails = () => {
        setShowMasterDetails(false);
        setMasterDetails(null);
        setMasterDetailsLoading(false);
    };

    const handleRemoveMaster = async () => {
        if (!detailsOrder?.id || !user?.id) return;
        if ([ORDER_STATUS.COMPLETED, ORDER_STATUS.CONFIRMED].includes(detailsOrder.status)) {
            showToast?.(TRANSLATIONS[language].errorCannotUnassign || 'Cannot remove master from completed/confirmed order', 'error');
            return;
        }
        const confirmRemove = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.unassignMaster(detailsOrder.id, user.id, 'dispatcher_unassign');
                if (result.success) {
                    showToast?.(TRANSLATIONS[language].toastMasterUnassigned || 'Master removed', 'success');
                    setIsEditing(false);
                    setDetailsOrder(null);
                    await loadData();
                } else {
                    showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error');
                }
            } catch (e) {
                showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error');
            } finally {
                setActionLoading(false);
            }
        };

        const msg = TRANSLATIONS[language].alertUnassignMsg || 'Remove master and reopen this order?';
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) confirmRemove();
        } else {
            Alert.alert(TRANSLATIONS[language].alertUnassignTitle || 'Remove Master', msg, [
                { text: TRANSLATIONS[language].cancel, style: 'cancel' },
                { text: TRANSLATIONS[language].alertUnassignBtn || 'Remove', style: 'destructive', onPress: confirmRemove }
            ]);
        }
    };

    const handleSaveEdit = async () => {
        setActionLoading(true);
        try {
            // Normalize phone before saving
            const normalizedPhone = ordersService.normalizeKyrgyzPhone(editForm.client_phone);
            if (editForm.client_phone && !normalizedPhone) {
                showToast?.(TRANSLATIONS[language].errorPhoneFormat || 'Invalid phone format', 'error');
                setActionLoading(false);
                return;
            }

            const parsedCallout = editForm.callout_fee !== '' && editForm.callout_fee !== null && editForm.callout_fee !== undefined
                ? parseFloat(editForm.callout_fee)
                : null;
            const calloutValue = !isNaN(parsedCallout) ? parsedCallout : null;
            const parsedInitial = editForm.initial_price !== '' && editForm.initial_price !== null && editForm.initial_price !== undefined
                ? parseFloat(editForm.initial_price)
                : null;
            const initialValue = !isNaN(parsedInitial) ? parsedInitial : null;

            if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
                showToast?.(TRANSLATIONS[language].errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
                setActionLoading(false);
                return;
            }

            // Prepare updates - including all editable fields
            // Debug log to see what's being sent
            console.log('[DispatcherDashboard] handleSaveEdit - editForm.callout_fee:', editForm.callout_fee, 'type:', typeof editForm.callout_fee);

            const updates = {
                problem_description: editForm.problem_description,
                dispatcher_note: editForm.dispatcher_note,
                full_address: editForm.full_address,
                area: editForm.area,
                orientir: editForm.orientir || null,
                callout_fee: editForm.callout_fee, // Pass raw value, let service handle conversion
                initial_price: editForm.initial_price, // Add initial_price
                client_name: editForm.client_name,
                client_phone: normalizedPhone || editForm.client_phone,
            };

            console.log('[DispatcherDashboard] handleSaveEdit - full updates object:', JSON.stringify(updates));

            const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
            if (result.success) {
                showToast?.(TRANSLATIONS[language].toastUpdated, 'success');
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
            } else { showToast?.(TRANSLATIONS[language].toastOrderFailed || TRANSLATIONS[language].toastCreateFailed, 'error'); }
        } catch (e) { showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleCancel = (orderId) => {
        const confirmCancel = async () => {
            const result = await ordersService.cancelByClient(orderId, user.id, 'client_request');
            if (result.success) {
                showToast?.(TRANSLATIONS[language].statusCanceled, 'success');
                await loadData();
                setDetailsOrder(null); // Close the drawer/modal after success
            }
            else showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error');
        };

        if (Platform.OS === 'web') {
            if (window.confirm(TRANSLATIONS[language].alertCancelMsg || 'Are you sure you want to cancel this order?')) {
                confirmCancel();
            }
        } else {
            Alert.alert(
                TRANSLATIONS[language].alertCancelTitle,
                TRANSLATIONS[language].alertCancelMsg,
                [
                    { text: TRANSLATIONS[language].cancel, style: 'cancel' },
                    { text: TRANSLATIONS[language].yes || 'Yes', style: 'destructive', onPress: confirmCancel }
                ]
            );
        }
    };

    const handleReopen = async (orderId) => {
        const result = await ordersService.reopenOrder(orderId, user.id);
        if (result.success) { showToast?.(TRANSLATIONS[language].filterStatusReopened, 'success'); await loadData(); }
        else showToast?.(TRANSLATIONS[language].toastFailedPrefix + (TRANSLATIONS[language].errorGeneric || 'Error'), 'error');
    };

    const copyToClipboard = (text) => {
        if (!text) return;
        Clipboard.setString(text);
        showToast?.(TRANSLATIONS[language].toastCopied, 'success');
    };

    const handleLogout = async () => {
        const doLogout = async () => {
            try {
                await authService.logoutUser();
            } catch (e) {
                console.error('Logout failed', e);
            } finally {
                setIsSidebarOpen(false);
                navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            }
        };
        if (Platform.OS === 'web') {
            if (window.confirm(TRANSLATIONS[language].alertLogoutTitle + '?')) await doLogout();
        } else {
            Alert.alert(TRANSLATIONS[language].alertLogoutTitle, TRANSLATIONS[language].alertLogoutMsg, [
                { text: TRANSLATIONS[language].cancel, style: 'cancel' },
                { text: TRANSLATIONS[language].alertLogoutBtn, onPress: doLogout }
            ]);
        }
    };

    const clearForm = () => {
        setNewOrder({
            ...INITIAL_ORDER_STATE,
            calloutFee: platformSettings?.base_price ? String(platformSettings.base_price) : ''
        });
        setConfirmChecked(false); setPhoneError('');
        setIdempotencyKey(generateIdempotencyKey());
        AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
        showToast?.(TRANSLATIONS[language].toastFormCleared, 'success');
    };

    // Keep location but clear other fields
    const keepLocationAndReset = () => {
        setNewOrder(prev => ({
            ...INITIAL_ORDER_STATE,
            calloutFee: platformSettings?.base_price ? String(platformSettings.base_price) : '',
            area: prev.area,
            fullAddress: prev.fullAddress
        }));
        setIdempotencyKey(generateIdempotencyKey());
        setConfirmChecked(false);
        setCreationSuccess(null);
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
                                    {(TRANSLATIONS[language][opt.label] || opt.label)}{typeof opt.count === 'number' ? ` (${opt.count})` : ''}
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
                            <View style={styles.sidebarNavRow}>
                                <Text style={[styles.sidebarNavText, activeTab === 'queue' && styles.sidebarNavTextActive]}>{TRANSLATIONS[language].ordersQueue}</Text>
                                {needsActionOrders.length > 0 && (
                                    <View style={styles.sidebarBadge}>
                                        <Text style={styles.sidebarBadgeText}>{needsActionOrders.length}</Text>
                                    </View>
                                )}
                            </View>
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
                                onPress={cycleLanguage}>
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

    const renderFilters = () => {
        const statusOptionsWithCounts = STATUS_OPTIONS.map(opt => ({
            ...opt,
            count: statusCounts[opt.id] ?? 0,
        }));
        const currentStatusLabel = TRANSLATIONS[language][STATUS_OPTIONS.find(o => o.id === statusFilter)?.label]
            || STATUS_OPTIONS.find(o => o.id === statusFilter)?.label
            || statusFilter;

        return (
        <View style={styles.filtersContainer}>
            {/* Search */}
            <View style={styles.searchRow}>
                <View style={[styles.searchInputWrapper, !isDark && styles.btnLight]}>
                    <Text style={styles.searchIcon}>⌕</Text>
                    <TextInput style={[styles.searchInput, !isDark && styles.textDark]} placeholder={TRANSLATIONS[language].placeholderSearch} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
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
                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: TRANSLATIONS[language].pickerStatus, options: statusOptionsWithCounts, value: statusFilter, onChange: setStatusFilter
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {currentStatusLabel} ({statusCounts[statusFilter] ?? 0})
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: TRANSLATIONS[language].pickerDispatcher, options: DISPATCHER_OPTIONS, value: filterDispatcher, onChange: setFilterDispatcher
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {TRANSLATIONS[language][DISPATCHER_OPTIONS.find(o => o.id === filterDispatcher)?.label] || DISPATCHER_OPTIONS.find(o => o.id === filterDispatcher)?.label || filterDispatcher}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: TRANSLATIONS[language].pickerUrgency, options: URGENCY_OPTIONS, value: filterUrgency, onChange: setFilterUrgency
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {TRANSLATIONS[language][URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label] || URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label || filterUrgency}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: TRANSLATIONS[language].pickerService, options: [{ id: 'all', label: TRANSLATIONS[language].labelAllServices }, ...serviceTypes], value: filterService, onChange: setFilterService
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {filterService === 'all' ? TRANSLATIONS[language].labelAllServices : serviceTypes.find(s => s.id === filterService)?.label || filterService}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: TRANSLATIONS[language].pickerSort, options: SORT_OPTIONS, value: filterSort, onChange: setFilterSort
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {TRANSLATIONS[language][SORT_OPTIONS.find(o => o.id === filterSort)?.label] || SORT_OPTIONS.find(o => o.id === filterSort)?.label || filterSort}
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
    };

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
                        visible: true, title: TRANSLATIONS[language].pickerErrorType, options: ATTENTION_FILTER_OPTIONS, value: filterAttentionType, onChange: setFilterAttentionType
                    })}>
                        <Text style={styles.miniFilterText}>{TRANSLATIONS[language][ATTENTION_FILTER_OPTIONS.find(o => o.id === filterAttentionType)?.label] || TRANSLATIONS[language][filterAttentionType] || filterAttentionType}</Text>
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
                                visible: true, title: TRANSLATIONS[language].pickerErrorType, options: ATTENTION_FILTER_OPTIONS, value: filterAttentionType, onChange: setFilterAttentionType
                            })}>
                                <Text style={styles.miniFilterText}>{TRANSLATIONS[language][ATTENTION_FILTER_OPTIONS.find(o => o.id === filterAttentionType)?.label] || TRANSLATIONS[language][filterAttentionType] || filterAttentionType}</Text>
                                <Text style={styles.miniFilterArrow}>▾</Text>
                            </TouchableOpacity>
                        )}

                        {/* Sort Button - Redesigned */}
                        {showNeedsAttention && (
                            <TouchableOpacity style={styles.cleanSortBtn} onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}>
                                <Text style={styles.cleanSortText}>{sortOrder === 'newest' ? TRANSLATIONS[language].btnSortNewest : TRANSLATIONS[language].btnSortOldest}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                {showNeedsAttention && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attentionScroll}>
                        {sortedNeedsAction.map(o => (
                            <TouchableOpacity key={o.id} style={[styles.attentionCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(o)}>
                                <Text style={styles.attentionBadge}>{o.is_disputed ? TRANSLATIONS[language].badgeDispute : o.status === 'completed' ? TRANSLATIONS[language].badgeUnpaid : o.status?.includes('canceled') ? (TRANSLATIONS[language].badgeCanceled || 'Canceled') : TRANSLATIONS[language].badgeStuck}</Text>
                                <Text style={[styles.attentionService, !isDark && styles.textDark]}>{getServiceLabel(o.service_type, t)}</Text>
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
                <Text style={styles.compactStatusText}>{getOrderStatusLabel(item.status, t)}</Text>
            </View>
            {/* Main info */}
            <View style={styles.compactMain}>
                <View style={styles.compactTopRow}>
                    <Text style={[styles.compactId, !isDark && styles.textSecondary]}>#{item.id?.slice(-6)}</Text>
                    <Text style={[styles.compactService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, t)}</Text>
                    {item.urgency && item.urgency !== 'planned' && (
                        <Text style={[styles.compactUrgency, item.urgency === 'emergency' && styles.compactUrgencyEmergency]}>
                            {TRANSLATIONS[language][`urgency${item.urgency.charAt(0).toUpperCase() + item.urgency.slice(1)}`] || item.urgency.toUpperCase()}
                        </Text>
                    )}
                </View>
                <Text style={[styles.compactAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{item.full_address}</Text>
                <View style={styles.compactBottomRow}>
                    <Text style={[styles.compactClient, !isDark && styles.textDark]}>{item.client?.full_name || item.client_name || 'N/A'}</Text>
                    {item.master && <Text style={styles.compactMaster}>{TRANSLATIONS[language].labelMasterPrefix}{item.master.full_name}</Text>}
                    {item.final_price && <Text style={styles.compactPrice}>{item.final_price}c</Text>}
                    {['placed', 'reopened'].includes(item.status) && (
                        <TouchableOpacity
                            style={styles.compactAssignBtn}
                            onPress={(e) => { e.stopPropagation?.(); openAssignModal(item); }}
                        >
                            <Text style={styles.compactAssignText}>{TRANSLATIONS[language].actionAssign}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            {/* Right side */}
            <View style={styles.compactRight}>
                <Text style={styles.compactTime}>{getTimeAgo(item.created_at, t)}</Text>
                <Text style={[styles.compactChevron, !isDark && styles.textSecondary]}>›</Text>
            </View>
        </TouchableOpacity>
    );

    const renderCard = ({ item }) => (
        <TouchableOpacity style={[styles.orderCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
            <View style={styles.cardHeader}>
                <Text style={[styles.cardService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, t)}</Text>
                <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] }]}>
                    <Text style={styles.cardStatusText}>{getOrderStatusLabel(item.status, t)}</Text>
                </View>
            </View>
            <Text style={[styles.cardAddr, !isDark && styles.textSecondary]} numberOfLines={2}>{item.full_address}</Text>
            <View style={styles.cardFooter}>
                <Text style={[styles.cardClient, !isDark && styles.textDark]}>{item.client?.full_name || item.client_name || 'N/A'}</Text>
                <Text style={styles.cardTime}>{getTimeAgo(item.created_at, t)}</Text>
            </View>
            {['placed', 'reopened'].includes(item.status) && (
                <TouchableOpacity
                    style={styles.cardAssignBtn}
                    onPress={(e) => { e.stopPropagation?.(); openAssignModal(item); }}
                >
                    <Text style={styles.cardAssignText}>{TRANSLATIONS[language].actionAssign}</Text>
                </TouchableOpacity>
            )}
            {item.status === 'completed' && (
                <TouchableOpacity style={styles.cardPayBtn} onPress={(e) => { e.stopPropagation?.(); setDetailsOrder(item); setShowPaymentModal(true); }}>
                    <Text style={styles.cardPayText}>{TRANSLATIONS[language].btnPayWithAmount ? TRANSLATIONS[language].btnPayWithAmount.replace('{0}', item.final_price) : `Pay ${item.final_price}c`}</Text>
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
                    ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, !isDark && { color: '#64748b' }]}>{TRANSLATIONS[language].emptyList}</Text></View>}
                    ListFooterComponent={<Pagination current={page} total={totalPages} onPageChange={setPage} />}
                />
            </View>
        );
    };

    const renderCreateOrder = () => {
        const publishDisabled = !confirmChecked || actionLoading;
        return (
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
                        <View style={styles.successDivider}>
                            <Text style={styles.successDividerText}>{TRANSLATIONS[language].createAnotherOrder}</Text>
                        </View>
                        <View style={styles.successButtonRow}>
                            <TouchableOpacity style={styles.successKeepLocationBtn} onPress={keepLocationAndReset}>
                                <Text style={styles.successKeepLocationText}>{TRANSLATIONS[language].keepLocation} →</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.successBtnAlt} onPress={() => { setCreationSuccess(null); clearForm(); }}>
                                <Text style={styles.successBtnAltText}>{TRANSLATIONS[language].startFresh}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.createSections}>
                        {/* Client */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createClientDetails}</Text>
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createPhone} *</Text>
                            <View style={styles.inputWithIcon}>
                                <TextInput style={[styles.input, styles.inputWithPaste, phoneError && styles.inputError, !isDark && styles.inputLight]} placeholder="+996..."
                                    value={newOrder.clientPhone} onChangeText={t => setNewOrder({ ...newOrder, clientPhone: t })}
                                    onBlur={handlePhoneBlur} keyboardType="phone-pad" placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />
                                <TouchableOpacity style={styles.inFieldBtn} onPress={handlePastePhone}>
                                    <Text style={styles.inFieldBtnText}>⎘</Text>
                                </TouchableOpacity>
                            </View>
                            {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createName}</Text>
                            <TextInput style={[styles.input, !isDark && styles.inputLight]} placeholder={TRANSLATIONS[language].createName} value={newOrder.clientName}
                                onChangeText={t => setNewOrder({ ...newOrder, clientName: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />
                        </View>

                        {/* Location */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createLocation}</Text>

                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createDistrict} *</Text>
                            <TouchableOpacity
                                style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, !isDark && styles.inputLight]}
                                onPress={openDistrictPicker}
                            >
                                <Text style={[styles.pickerBtnText, !newOrder.area && styles.placeholderText, !isDark && styles.textDark]}>
                                    {newOrder.area ? (districts.find(d => d.id === newOrder.area)?.label || newOrder.area) : (TRANSLATIONS[language].selectOption || 'Select')}
                                </Text>
                                <Text style={{ color: '#94a3b8', fontSize: 12 }}>▼</Text>
                            </TouchableOpacity>

                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createFullAddress} *</Text>
                            <TextInput style={[styles.input, !isDark && styles.inputLight]}
                                placeholder={TRANSLATIONS[language].createFullAddress}
                                value={newOrder.fullAddress}
                                onChangeText={t => setNewOrder({ ...newOrder, fullAddress: t })}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            />

                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createOrientir || 'Landmark/Orientir'}</Text>
                            <TextInput style={[styles.input, !isDark && styles.inputLight]}
                                placeholder={TRANSLATIONS[language].orientirPlaceholder || "e.g. Near Beta Stores"}
                                value={newOrder.orientir}
                                onChangeText={t => setNewOrder({ ...newOrder, orientir: t })}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            />
                        </View>


                        {/* Service */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createServiceType}</Text>
                            <View style={styles.serviceGrid}>
                                {serviceTypes.map(s => (
                                    <TouchableOpacity key={s.id} style={[styles.serviceBtn, newOrder.serviceType === s.id && styles.serviceBtnActive, !isDark && newOrder.serviceType !== s.id && styles.btnLight]}
                                        onPress={() => setNewOrder({ ...newOrder, serviceType: s.id })}>
                                        <Text style={[styles.serviceBtnText, !isDark && newOrder.serviceType !== s.id && styles.textDark, newOrder.serviceType === s.id && styles.serviceBtnTextActive]}>{s.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].problemDesc} *</Text>
                            <View style={{ position: 'relative' }}>
                                <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} placeholder="..." value={newOrder.problemDescription}
                                    onChangeText={t => setNewOrder({ ...newOrder, problemDescription: t.substring(0, 500) })} multiline numberOfLines={3} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} maxLength={500} />
                                <Text style={styles.charCounter}>{newOrder.problemDescription.length}/500</Text>
                            </View>
                        </View>

                        {/* Schedule */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].schedule}</Text>
                            <View style={styles.urgencyRow}>
                                <TouchableOpacity style={[styles.urgencyBtn, newOrder.urgency === 'planned' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'planned' && styles.btnLight]}
                                    onPress={() => setNewOrder({ ...newOrder, urgency: 'planned' })}>
                                    <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'planned' && styles.textDark, newOrder.urgency === 'planned' && styles.urgencyTextActive]}>{TRANSLATIONS[language].urgencyPlanned}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.urgencyBtn, newOrder.urgency === 'urgent' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'urgent' && styles.btnLight]}
                                    onPress={() => setNewOrder({ ...newOrder, urgency: 'urgent' })}>
                                    <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'urgent' && styles.textDark, newOrder.urgency === 'urgent' && styles.urgencyTextActive]}>{TRANSLATIONS[language].urgencyUrgent}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.urgencyBtn, newOrder.urgency === 'emergency' && styles.urgencyBtnActive, { borderColor: '#ef4444' }, !isDark && newOrder.urgency !== 'emergency' && styles.btnLight]}
                                    onPress={() => setNewOrder({ ...newOrder, urgency: 'emergency' })}>
                                    <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'emergency' && styles.textDark, newOrder.urgency === 'emergency' && styles.urgencyTextActive]}>{TRANSLATIONS[language].urgencyEmergency}</Text>
                                </TouchableOpacity>
                            </View>
                            {/* Date/Time Selection for Planned Orders */}
                            {newOrder.urgency === 'planned' && (
                                <View style={styles.plannedPickerContainer}>
                                    <View style={styles.plannedTimeRow}>
                                        <View style={styles.plannedDateInput}>
                                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].preferredDate || 'Date'}</Text>
                                            {Platform.OS === 'web' ? (
                                                <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                                                    {React.createElement('input', {
                                                        type: 'date',
                                                        value: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : '',
                                                        onChange: (e) => {
                                                            const val = e.target.value; // YYYY-MM-DD
                                                            if (val) {
                                                                const [y, m, d] = val.split('-');
                                                                setNewOrder({ ...newOrder, preferredDate: `${d}.${m}.${y}` });
                                                            } else {
                                                                setNewOrder({ ...newOrder, preferredDate: '' });
                                                            }
                                                        },
                                                        style: {
                                                            border: 'none',
                                                            outline: 'none',
                                                            background: 'transparent',
                                                            color: isDark ? '#fff' : '#0f172a',
                                                            width: '100%',
                                                            height: '100%',
                                                            fontFamily: 'system-ui',
                                                            fontSize: 14
                                                        }
                                                    })}
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={[styles.input, styles.pickerBtnDisplay, !isDark && styles.inputLight]}
                                                    onPress={() => setShowDatePicker(true)}
                                                >
                                                    <Text style={[styles.pickerBtnText, !newOrder.preferredDate && styles.placeholderText, !isDark && styles.textDark]}>
                                                        {newOrder.preferredDate || 'DD.MM.YYYY'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <View style={styles.plannedTimeInput}>
                                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].preferredTime || 'Time'}</Text>
                                            {Platform.OS === 'web' ? (
                                                <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                                                    {React.createElement('input', {
                                                        type: 'time',
                                                        value: newOrder.preferredTime || '',
                                                        onChange: (e) => setNewOrder({ ...newOrder, preferredTime: e.target.value }),
                                                        style: {
                                                            border: 'none',
                                                            outline: 'none',
                                                            background: 'transparent',
                                                            color: isDark ? '#fff' : '#0f172a',
                                                            width: '100%',
                                                            height: '100%',
                                                            fontFamily: 'system-ui',
                                                            fontSize: 14
                                                        }
                                                    })}
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={[styles.input, styles.pickerBtnDisplay, !isDark && styles.inputLight]}
                                                    onPress={() => setShowTimePicker(true)}
                                                >
                                                    <Text style={[styles.pickerBtnText, !newOrder.preferredTime && styles.placeholderText, !isDark && styles.textDark]}>
                                                        {newOrder.preferredTime || 'HH:MM'}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>

                                    {/* Mobile Native Pickers (Modal) */}
                                    {Platform.OS !== 'web' && showDatePicker && (
                                        <DateTimePicker
                                            value={parseDateStr(newOrder.preferredDate)}
                                            mode="date"
                                            display="default"
                                            onChange={onDateChange}
                                        />
                                    )}
                                    {Platform.OS !== 'web' && showTimePicker && (
                                        <DateTimePicker
                                            value={parseTimeStr(newOrder.preferredTime)}
                                            mode="time"
                                            display="default"
                                            onChange={onTimeChange}
                                        />
                                    )}
                                </View>
                            )}
                        </View>

                        {/* Pricing */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].pricing}</Text>
                            {/* Pricing Type Selector */}
                            <View style={styles.pricingTypeRow}>
                                <TouchableOpacity
                                    style={[styles.pricingTypeBtn, newOrder.pricingType === 'unknown' && styles.pricingTypeBtnActive]}
                                    onPress={() => setNewOrder({ ...newOrder, pricingType: 'unknown' })}>
                                    <Text style={[styles.pricingTypeBtnText, newOrder.pricingType === 'unknown' && styles.pricingTypeBtnTextActive]}>{TRANSLATIONS[language].pricingMasterQuotes}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.pricingTypeBtn, newOrder.pricingType === 'fixed' && styles.pricingTypeBtnActiveGreen]}
                                    onPress={() => setNewOrder({ ...newOrder, pricingType: 'fixed' })}>
                                    <Text style={[styles.pricingTypeBtnText, newOrder.pricingType === 'fixed' && styles.pricingTypeBtnTextActive]}>{TRANSLATIONS[language].pricingFixed}</Text>
                                </TouchableOpacity>
                            </View>
                            {/* Price Inputs */}
                            <View style={styles.pricingInputRow}>
                                <View style={styles.priceInputItem}>
                                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].calloutFee}</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder={platformSettings ? String(platformSettings.base_price) : "..."}
                                        keyboardType="numeric"
                                        value={newOrder.calloutFee}
                                        onChangeText={t => setNewOrder({ ...newOrder, calloutFee: sanitizeNumberInput(t) })}
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    />
                                </View>
                                {newOrder.pricingType === 'fixed' && (
                                    <View style={styles.priceInputItem}>
                                        <Text style={[styles.inputLabel, { color: '#22c55e' }]}>{TRANSLATIONS[language].fixedAmount}</Text>
                                        <TextInput
                                            style={[styles.input, !isDark && styles.inputLight]}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            value={newOrder.initialPrice}
                                            onChangeText={t => setNewOrder({ ...newOrder, initialPrice: sanitizeNumberInput(t) })}
                                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        />
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Internal Note */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].sectionNote}</Text>
                            <View style={{ position: 'relative' }}>
                                <TextInput
                                    style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                                    placeholder={TRANSLATIONS[language].createInternalNote}
                                    value={newOrder.dispatcherNote}
                                    onChangeText={t => setNewOrder({ ...newOrder, dispatcherNote: t.substring(0, 500) })}
                                    multiline
                                    numberOfLines={2}
                                    maxLength={500}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />
                                <Text style={styles.charCounter}>{(newOrder.dispatcherNote || '').length}/500</Text>
                            </View>
                        </View>

                        {/* Spacer for fixed bottom bar */}
                        <View style={{ height: 120 }} />
                    </View>
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
                            <TouchableOpacity
                                style={[
                                    styles.bottomPublishBtn,
                                    publishDisabled && styles.bottomPublishBtnDisabled,
                                    publishDisabled && styles.pointerEventsNone
                                ]}
                                onPress={publishDisabled ? undefined : handleCreateOrder}
                            >
                                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomPublishBtnText}>{TRANSLATIONS[language].createPublish}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                )
            }
            </View>
        );
    };

    // Details Drawer
    const renderDetailsDrawer = () => {
        if (!detailsOrder) return null;
        // NOTE: handleSaveEdit is defined earlier in the component (around line 1146)
        // with proper fee handling, area, orientir, etc.
        const calloutValue = detailsOrder.callout_fee;
        const screenWidth = Dimensions.get('window').width;
        const drawerWidth = screenWidth <= 480 ? screenWidth : (screenWidth > 500 ? 400 : screenWidth * 0.85);
        const fullWidthDrawer = drawerWidth >= screenWidth;

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
                                {/* Edit Button */}
                                <TouchableOpacity
                                    style={[styles.editBtn, isEditing && styles.editBtnActive]}
                                    onPress={() => {
                                        if (isEditing) {
                                            // If canceling edit
                                            setIsEditing(false);
                                        } else {
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
                                        <Text style={styles.drawerStatusText}>{getOrderStatusLabel(detailsOrder.status, t)}</Text>
                                    </View>
                                    {['placed', 'reopened'].includes(detailsOrder.status) && (
                                        <TouchableOpacity style={styles.drawerBtn} onPress={() => openAssignModal(detailsOrder)}>
                                            <Text style={styles.drawerBtnText}>{TRANSLATIONS[language].actionClaim}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {detailsOrder.status === 'completed' && (
                                        <TouchableOpacity style={[styles.drawerBtn, { backgroundColor: '#22c55e' }]} onPress={() => {
                                            setPaymentOrder(detailsOrder); // Store order for payment modal
                                            setDetailsOrder(null); // Close drawer
                                            setShowPaymentModal(true);
                                        }}>
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

                                    {/* Location Editing */}
                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].createDistrict || 'District'}</Text>
                                    <TouchableOpacity
                                        style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, !isDark && styles.inputLight]}
                                        onPress={openEditDistrictPicker}
                                    >
                                        <Text style={[styles.pickerBtnText, !editForm.area && styles.placeholderText, !isDark && styles.textDark]}>
                                            {editForm.area ? (districts.find(d => d.id === editForm.area)?.label || editForm.area) : (TRANSLATIONS[language].selectOption || 'Select')}
                                        </Text>
                                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>▼</Text>
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

                                    {detailsOrder?.master && (
                                        <View style={styles.editActionRow}>
                                            <TouchableOpacity style={[styles.editActionBtn, styles.editActionPrimary]} onPress={() => openAssignModal(detailsOrder)}>
                                                <Text style={styles.editActionText}>{TRANSLATIONS[language].actionAssign || 'Assign'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.editActionBtn, styles.editActionDanger]} onPress={handleRemoveMaster}>
                                                <Text style={styles.editActionText}>{TRANSLATIONS[language].actionUnassign || 'Remove Master'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}


                                    <TouchableOpacity
                                        style={[styles.saveEditBtn, actionLoading && styles.pointerEventsNone]}
                                        onPress={actionLoading ? undefined : handleSaveEdit}
                                    >
                                        {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveEditText}>{TRANSLATIONS[language].btnSaveChanges}</Text>}
                                    </TouchableOpacity>
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
                                                {calloutValue ?? '-'}{calloutValue !== null && calloutValue !== undefined ? 'c' : ''}
                                            </Text>
                                        </View>
                                        <View style={styles.finRow}>
                                            <Text style={styles.finLabel}>{detailsOrder.final_price ? TRANSLATIONS[language].labelFinal : TRANSLATIONS[language].labelInitial}</Text>
                                            <Text style={[styles.finValue, !isDark && styles.textDark, detailsOrder.final_price && { color: '#22c55e' }]}>
                                                {detailsOrder.final_price || detailsOrder.initial_price || TRANSLATIONS[language].priceOpen}c
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
                                    {['placed', 'reopened', 'expired', 'canceled_by_master'].includes(detailsOrder.status) && (
                                        <TouchableOpacity style={styles.cancelBtn} onPress={() => { handleCancel(detailsOrder.id); setDetailsOrder(null); }}>
                                            <Text style={styles.cancelText}>{TRANSLATIONS[language].alertCancelTitle}</Text>
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

    // Payment Modal
    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS[language].titlePayment}</Text>
                    <Text style={styles.modalSubtitle}>{TRANSLATIONS[language].modalOrderPrefix.replace('{0}', paymentOrder?.id?.slice(-8))}</Text>
                    <Text style={styles.modalAmount}>{TRANSLATIONS[language].labelAmount} {paymentOrder?.final_price || paymentOrder?.initial_price || 'N/A'}с</Text>
                    <View style={styles.paymentMethods}>
                        {['cash', 'transfer', 'card'].map(m => (
                            <TouchableOpacity key={m} style={[styles.paymentMethod, paymentData.method === m && styles.paymentMethodActive]}
                                onPress={() => setPaymentData({ ...paymentData, method: m })}>
                                <Text style={[styles.paymentMethodText, paymentData.method === m && { color: '#fff' }]}>{TRANSLATIONS[language][`payment${m.charAt(0).toUpperCase() + m.slice(1)}`] || m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {paymentData.method === 'transfer' && (
                        <TextInput style={styles.input} placeholder={TRANSLATIONS[language].labelProof} value={paymentData.proofUrl}
                            onChangeText={t => setPaymentData({ ...paymentData, proofUrl: t })} placeholderTextColor="#64748b" />
                    )}
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowPaymentModal(false); setPaymentOrder(null); }}>
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
                    <ScrollView style={styles.mastersList}>
                        {masters.map(m => {
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
                                        {TRANSLATIONS[language].labelRating}: {m.rating} • {activeJobs}/{maxJobs ?? '-'} {TRANSLATIONS[language].labelJobs}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                        {masters.length === 0 && <Text style={styles.noMasters}>{TRANSLATIONS[language].noMasters}</Text>}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAssignModal(false); setAssignTarget(null); }}>
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
                        <TouchableOpacity onPress={closeMasterDetails}>
                            <Text style={styles.modalCancelText}>✕</Text>
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
                                <Text style={styles.masterDetailsLabel}>{TRANSLATIONS[language].labelRating || 'Rating'}</Text>
                                <Text style={styles.masterDetailsValue}>{masterDetails?.summary?.rating ?? 0}</Text>
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
            {renderMasterDetailsModal()}
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
    cardAssignBtn: { backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 8 },
    cardAssignText: { fontSize: 12, fontWeight: '700', color: '#60a5fa' },
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
    drawerOverlayWeb: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 500 },
    drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    drawerBackdropHidden: { flex: 0, width: 0 },
    drawerContent: { width: SCREEN_WIDTH > 500 ? 400 : SCREEN_WIDTH * 0.85, maxWidth: '100%', backgroundColor: '#1e293b', height: '100%' },
    drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    drawerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    drawerDate: { fontSize: 11, color: '#64748b' },
    drawerActions: { flexDirection: 'row', gap: 12 },
    drawerActionText: { fontSize: 18, color: '#94a3b8' },
    drawerBody: { flex: 1, padding: 16 },
    drawerSections: { flex: 1 },
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
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', paddingHorizontal: 20, zIndex: 9999 },
    modalContent: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
    modalSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 12 },
    modalAmount: { fontSize: 20, color: '#22c55e', fontWeight: '700', marginBottom: 16 },
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
    masterItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    masterItemDisabled: { opacity: 0.5 },
    masterName: { fontSize: 14, fontWeight: '700', color: '#fff' },
    masterNameDisabled: { color: '#94a3b8' },
    masterInfo: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    masterInfoDisabled: { color: '#64748b' },
    masterLimitBadge: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
    noMasters: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 20 },

    // Edit Actions
    editActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    editActionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    editActionPrimary: { backgroundColor: '#3b82f6' },
    editActionDanger: { backgroundColor: '#ef4444' },
    editActionText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // Master Details Modal
    masterDetailsCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24 },
    masterDetailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    masterDetailsName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
    masterDetailsSub: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
    masterDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    masterDetailsLabel: { fontSize: 12, color: '#64748b' },
    masterDetailsValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
    masterDetailsBlocked: { marginTop: 8, fontSize: 12, color: '#ef4444', fontWeight: '600' },

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
    sidebarNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sidebarNavText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    sidebarNavTextActive: { color: '#fff' },
    sidebarBadge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
    sidebarBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
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
    compactAssignBtn: { backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    compactAssignText: { fontSize: 10, fontWeight: '700', color: '#60a5fa' },

    // Create Order Wrapper & Fixed Bottom Bar
    createWrapper: { flex: 1 },
    createSections: { flex: 1 },
    createScrollContent: { paddingBottom: 20 },
    fixedBottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: 'rgba(71,85,105,0.3)', padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
    bottomBarButtons: { flexDirection: 'row', gap: 12 },
    bottomClearBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', alignItems: 'center' },
    bottomClearBtnText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    bottomPublishBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
    bottomPublishBtnDisabled: { backgroundColor: '#475569', opacity: 0.7 },
    pointerEventsNone: { pointerEvents: 'none' },
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

    // Inline Dropdown (for districts etc)


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

    // Paste Button (inside input field)
    inputWithIcon: { position: 'relative' },
    inputWithPaste: { paddingRight: 44 },
    inFieldBtn: { position: 'absolute', right: 4, top: 4, bottom: 4, width: 36, backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    inFieldBtnText: { fontSize: 16, color: '#3b82f6' },

    // Character Counter
    charCounter: { position: 'absolute', bottom: 8, right: 12, fontSize: 10, color: '#64748b', fontWeight: '500' },

    // Success Screen Improvements
    successDivider: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(71,85,105,0.3)', width: '100%', alignItems: 'center' },
    successDividerText: { fontSize: 12, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    successButtonRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
    successKeepLocationBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#3b82f6', alignItems: 'center' },
    successKeepLocationText: { color: '#fff', fontSize: 14, fontWeight: '700' },

    // Recent Address Button
    recentAddrBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 8 },
    recentAddrBtnText: { fontSize: 11, color: '#3b82f6', fontWeight: '600' },

    // Master Header
    masterHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    masterDetailsBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 8 },
    masterDetailsBtnText: { fontSize: 11, fontWeight: '700', color: '#3b82f6' },

    // Pricing Type Selector
    pricingTypeRow: { flexDirection: 'row', backgroundColor: 'rgba(71,85,105,0.2)', borderRadius: 12, padding: 4, marginBottom: 16 },
    pricingTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    pricingTypeBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
    pricingTypeBtnActive: { backgroundColor: '#475569' },
    pricingTypeBtnActiveGreen: { backgroundColor: '#22c55e' },
    pricingTypeBtnTextActive: { color: '#fff' },
    pricingInputRow: { flexDirection: 'row', gap: 12 },

    // Planned Date/Time Picker
    plannedPickerContainer: { marginTop: 16 },
    plannedTimeRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    plannedDateInput: { flex: 1, minWidth: 160 },
    plannedTimeInput: { flex: 1, minWidth: 130 },

    // Web Picker specific
    webPickerInput: {
        paddingVertical: Platform.OS === 'web' ? 8 : 0,
        paddingHorizontal: Platform.OS === 'web' ? 8 : 12,
        height: 40,
        justifyContent: 'center',
        overflow: 'hidden'
    },

    // Mobile Picker Button Display
    pickerBtnDisplay: {
        justifyContent: 'center'
    },
    pickerBtnText: {
        fontSize: 14,
        color: '#fff'
    },
    placeholderText: {
        color: '#94a3b8'
    }
});
