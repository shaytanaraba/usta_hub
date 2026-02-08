/**
 * Master Dashboard - v6.0 (V2 Schema Compatible)
 * Changes:
 * - 2 tabs: Orders (Available only) + My Account (My Jobs/History/Profile)
 * - Balance system display
 * - Dynamic service types and cancellation reasons from DB
 * - Uses claim_order RPC with blocker handling
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, RefreshControl,
    Modal, TextInput, ScrollView, ActivityIndicator, Platform, Dimensions, Pressable, Linking, Animated, Easing, PanResponder, InteractionManager,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    LogOut, ShieldCheck, Moon, Sun, MapPin, Check, X, Filter, ChevronDown, ChevronUp,
    ChevronLeft, ChevronRight, Settings,
    Inbox, ClipboardList, AlertCircle, Phone, User, Clock, Copy, Send, MessageCircle,
    RotateCw, Wallet
} from 'lucide-react-native';

import ordersService, { ORDER_STATUS } from '../services/orders';
import { useToast } from '../contexts/ToastContext';
import { useLocalization, LocalizationProvider } from '../contexts/LocalizationContext';
import { useTheme, ThemeProvider } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import deviceUtils from '../utils/device';
import { getOrderStatusLabel, getServiceLabel } from '../utils/orderHelpers';
import { useMasterRouteState } from './master/hooks/useMasterRouteState';
import { useMasterOrderProcessing } from './master/hooks/useMasterOrderProcessing';
import { useMasterDataLoader } from './master/hooks/useMasterDataLoader';
import { useMasterActions } from './master/hooks/useMasterActions';
import {
    ACCOUNT_VIEWS,
    MASTER_TABS,
    ORDER_SECTIONS,
    TERMINAL_ORDER_STATUSES,
} from './master/constants/domain';
import { normalizeMasterOrder } from './master/mappers/orderMappers';
import Dropdown from './master/components/Dropdown';
import Header from './master/components/Header';
import MyAccountTab from './master/components/MyAccountTab';
import SectionToggle from './master/components/SectionToggle';
import SkeletonOrderCard from './master/components/SkeletonOrderCard';
import { styles } from './master/styles/dashboardStyles';

const LOG_PREFIX = '[MasterDashboard]';
const PAGE_LIMIT = 20;
const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// Toggle performance logs in production by setting globalThis.__PERF_LOGS__ = true.
const PERF_LOG_ENABLED = __DEV__ || Boolean(typeof globalThis !== 'undefined' && globalThis.__PERF_LOGS__);
const LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_CACHE = {
    serviceTypes: { ts: 0, data: null },
    cancelReasons: { ts: 0, data: null },
    districts: { ts: 0, data: null },
};
const PERF_TARGETS_MS = {
    initialLoad: 2500,
    firstListLayout: 2800,
    refresh: 1500,
    reloadPool: 800,
    action: 1200,
    pageChange: 700,
};
const perfNow = () => {
    if (typeof globalThis !== 'undefined' && globalThis.performance && typeof globalThis.performance.now === 'function') {
        return globalThis.performance.now();
    }
    return Date.now();
};
const roundMs = (value) => Math.round(value);
const getCachedLookup = (key) => {
    const entry = LOOKUP_CACHE[key];
    if (!entry || !entry.data) return null;
    if (Date.now() - entry.ts > LOOKUP_TTL_MS) return null;
    return entry.data;
};
const setCachedLookup = (key, data) => {
    LOOKUP_CACHE[key] = { ts: Date.now(), data: Array.isArray(data) ? [...data] : data };
};
const sanitizeNumberInput = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 1) return cleaned;
    return `${parts.shift()}.${parts.join('')}`;
};

const formatPlannedDateTime = (preferredDate, preferredTime, language = 'en') => {
    if (!preferredDate) return '';
    const locale = language === 'ru' ? 'ru-RU' : (language === 'kg' ? 'ky-KG' : 'en-US');
    const timePart = preferredTime || '00:00:00';
    const parsed = new Date(`${preferredDate}T${timePart}`);
    if (Number.isNaN(parsed.getTime())) return `${preferredDate} ${preferredTime || ''}`.trim();
    if (preferredTime) {
        const dateText = parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
        const timeText = parsed.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        return `${dateText} ${timeText}`;
    }
    return parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
};

// ============================================
// ORDER CARD COMPONENT
// ============================================
const OrderCardBase = ({ order, isPool, isSelected, canClaim, actionLoading, onClaim, onStart, onComplete, onRefuse, onCopyAddress, onOpen }) => {
    const { t, language } = useLocalization();
    const { theme } = useTheme();
    const { width } = Dimensions.get('window');
    const columns = deviceUtils.getGridColumns();

    const isConfirmed = order.status === 'confirmed';
    const isStarted = order.status === 'started';
    const isClaimed = order.status === 'claimed';
    const isCompleted = order.status === 'completed';
    const districtText = order.area || order.district || '-';
    const landmarkText = order.orientir || order.landmark || order.landmark_orientir || '';
    const normalizeLabel = (label, fallback, key) => {
        const raw = label && label !== key ? label : fallback;
        return String(raw).replace(/:\s*$/, '');
    };
    const orientirLabel = normalizeLabel(t('labelOrientir'), 'Landmark', 'labelOrientir');
    const addressLabel = normalizeLabel(t('address'), 'Address', 'address');
    const districtLabel = normalizeLabel(t('filterArea'), 'District', 'filterArea');

    const getStatusColor = () => ({
        placed: theme.statusPlaced, claimed: theme.statusClaimed, started: theme.statusStarted,
        completed: theme.statusCompleted, confirmed: theme.statusConfirmed, reopened: theme.statusPlaced
    }[order.status] || theme.statusCanceled);

    const urgencyStyle = {
        emergency: { bg: `${theme.urgencyEmergency}15`, text: theme.urgencyEmergency },
        urgent: { bg: `${theme.urgencyUrgent}15`, text: theme.urgencyUrgent },
        planned: { bg: `${theme.urgencyPlanned}15`, text: theme.urgencyPlanned }
    }[order.urgency] || { bg: `${theme.urgencyPlanned}15`, text: theme.urgencyPlanned };
    const statusLabel = getOrderStatusLabel(order.status, t);
    const calloutFee = order.callout_fee;
    const displayPrice = order.final_price ?? order.initial_price;
    const displayPriceText = displayPrice !== null && displayPrice !== undefined
        ? `${displayPrice}`
        : calloutFee !== null && calloutFee !== undefined
            ? `${t('labelCallout') || 'Call-out:'} ${calloutFee}`
            : (t('priceOpen') || 'Open');
    const pricingSchemeLabel = order.pricing_type === 'fixed'
        ? (t('fixedPrice') || 'Fixed price')
        : (t('priceOpen') || 'Open');

    const getLocationDisplay = () => {
        if (isPool) return districtText;
        return districtText || order.full_address || '-';
    };

    const addressText = order.full_address || order.address || '';
    const addressValue = (isClaimed || isStarted) ? (addressText || districtText) : t('cardStartToSeeAddress');
    const showAddressCopy = Boolean((isClaimed || isStarted) && addressText);
    const showClientInfo = isClaimed || isStarted;
    const showDetailsBlock = !isPool;
    const showLandmarkInline = Boolean(isPool && landmarkText);
    const plannedScheduleText = order.urgency === 'planned'
        ? formatPlannedDateTime(order.preferred_date, order.preferred_time, language)
        : '';
    const cardMargin = 6;
    const containerPadding = 16;
    const totalGaps = (columns - 1) * (cardMargin * 2);
    const availableWidth = width - (containerPadding * 2) - totalGaps;
    const cardWidth = columns === 1 ? '100%' : (availableWidth / columns) - cardMargin;

    return (
        <TouchableOpacity
            activeOpacity={onOpen ? 0.85 : 1}
            onPress={() => onOpen?.(order)}
            style={[styles.orderCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary, width: cardWidth, opacity: isConfirmed ? 0.6 : 1 }]}
        >
            <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.serviceType, { color: theme.textPrimary }]} numberOfLines={1}>{getServiceLabel(order.service_type, t)}</Text>
                    <Text style={[styles.cardPrice, { color: theme.accentSuccess }]}>
                        {displayPriceText}
                    </Text>
                </View>
                    <View style={styles.cardMeta}>
                    <View style={[styles.urgencyBadge, { backgroundColor: isPool ? urgencyStyle.bg : `${getStatusColor()}15`, borderColor: isPool ? urgencyStyle.text : getStatusColor() }]}>
                        <Text style={[styles.urgencyText, { color: isPool ? urgencyStyle.text : getStatusColor() }]}>
                            {isPool ? t(`urgency${order.urgency.charAt(0).toUpperCase() + order.urgency.slice(1)}`) : statusLabel}
                        </Text>
                    </View>
                    {!isPool ? (
                        <View style={[styles.pricingBadge, { backgroundColor: `${theme.accentIndigo}14`, borderColor: theme.accentIndigo }]}>
                            <Text style={[styles.pricingText, { color: theme.accentIndigo }]} numberOfLines={1}>
                                {pricingSchemeLabel}
                            </Text>
                        </View>
                    ) : null}
                    <View style={styles.locationContainer}>
                        <MapPin size={10} color={theme.textMuted} />
                        <Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>{getLocationDisplay()}</Text>
                    </View>
                </View>
                <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>{order.problem_description}</Text>
                {plannedScheduleText ? (
                    <View style={[styles.plannedRow, { borderColor: theme.borderPrimary, backgroundColor: theme.bgSecondary }]}>
                        <Clock size={12} color={theme.textMuted} />
                        <Text style={[styles.plannedLabel, { color: theme.textMuted }]}>
                            {t('urgencyPlanned') || 'Planned'}:
                        </Text>
                        <Text style={[styles.plannedText, { color: theme.textSecondary }]} numberOfLines={1}>
                            {plannedScheduleText}
                        </Text>
                    </View>
                ) : null}
                {showLandmarkInline && (
                    <View style={styles.inlineHintRow}>
                        <Text style={[styles.inlineHintLabel, { color: theme.textMuted }]}>{orientirLabel}:</Text>
                        <Text style={[styles.inlineHintValue, { color: theme.textSecondary }]} numberOfLines={1}>{landmarkText}</Text>
                    </View>
                )}
                {showDetailsBlock && (
                    <View style={[styles.cardInfoBlock, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                        <View style={styles.cardInfoRow}>
                            <Text style={[styles.cardInfoLabel, { color: theme.textMuted }]}>{districtLabel}</Text>
                            <Text style={[styles.cardInfoValue, { color: theme.textPrimary }]} numberOfLines={1}>{districtText}</Text>
                        </View>
                        {Boolean(landmarkText) && (
                            <View style={styles.cardInfoRow}>
                                <Text style={[styles.cardInfoLabel, { color: theme.textMuted }]}>{orientirLabel}</Text>
                                <Text style={[styles.cardInfoValue, { color: theme.textPrimary }]} numberOfLines={1}>{landmarkText}</Text>
                            </View>
                        )}
                        <View style={styles.cardInfoRow}>
                            <Text style={[styles.cardInfoLabel, { color: theme.textMuted }]}>{addressLabel}</Text>
                            <Text style={[styles.cardInfoValue, { color: theme.textPrimary }]} numberOfLines={2}>{addressValue}</Text>
                        </View>
                        {showAddressCopy && (
                            <TouchableOpacity
                                style={[styles.copyAddressBtn, { borderColor: theme.accentIndigo, backgroundColor: `${theme.accentIndigo}12` }]}
                                onPress={() => onCopyAddress?.(addressText)}
                            >
                                <Text style={[styles.copyAddressText, { color: theme.accentIndigo }]}>
                                    {t('actionCopyAddress') || 'Copy address'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
                {showClientInfo && order.client && (
                    <View style={[styles.clientInfo, { borderTopColor: theme.borderLight }]}>
                        <View style={styles.clientRow}><User size={12} color={theme.textMuted} /><Text style={[styles.clientLabel, { color: theme.textMuted }]}>{order.client.full_name}</Text></View>
                        <View style={styles.clientRow}><Phone size={12} color={theme.accentPrimary} /><Text style={[styles.clientPhone, { color: theme.accentPrimary }]}>{order.client.phone}</Text></View>
                    </View>
                )}
                {!isConfirmed && (
                    <View style={styles.cardActions}>
                        {isPool && isSelected && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: canClaim ? theme.accentIndigo : theme.borderSecondary }]}
                                disabled={!canClaim || actionLoading}
                                onPress={() => onClaim?.(order.id)}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.actionButtonText}>
                                        {canClaim ? t('actionClaim') : t('actionLocked')}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        )}
                        {isClaimed && (
                            <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.accentIndigo }]} disabled={actionLoading} onPress={() => onStart?.(order.id)}>
                                <Text style={styles.actionButtonText}>{t('actionStart')}</Text>
                            </TouchableOpacity>
                        )}
                        {isStarted && (
                            <View style={styles.actionRow}>
                                <TouchableOpacity style={[styles.outlineButton, { borderColor: theme.accentDanger }]} onPress={() => onRefuse?.(order)}>
                                    <Text style={[styles.outlineButtonText, { color: theme.accentDanger }]}>{t('actionCancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionButton, { backgroundColor: theme.accentSuccess, flex: 1 }]} onPress={() => onComplete?.(order)}>
                                    <Text style={styles.actionButtonText}>{t('actionComplete')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {isCompleted && (
                            <View style={styles.pendingBadge}><Clock size={12} color={theme.textMuted} /><Text style={[styles.pendingText, { color: theme.textMuted }]}>{t('cardPendingApproval')}</Text></View>
                        )}
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};
const OrderCard = React.memo(OrderCardBase);

// ============================================
// MAIN DASHBOARD CONTENT
// ============================================
const DashboardContent = ({ navigation }) => {
    const { t, language } = useLocalization();
    const { theme, toggleTheme, isDark } = useTheme();
    const { cycleLanguage } = useLocalization();
    const { showToast } = useToast();
    const insets = useSafeAreaInsets();
    const safeT = useCallback((key, fallback) => {
        const value = t(key);
        return value && value !== key ? value : fallback;
    }, [t]);
    const blockerLabel = useCallback((code) => {
        const map = {
            NOT_VERIFIED: safeT('errorNotVerified', 'Your account is not verified'),
            INACTIVE: safeT('errorAccountInactive', 'Your account is inactive'),
            BALANCE_BLOCKED: safeT('errorBalanceBlocked', 'Your balance is blocked by admin'),
            NEGATIVE_BALANCE: safeT('errorNegativeBalance', 'Your balance is zero or negative. Please top up.'),
            INSUFFICIENT_BALANCE: safeT('errorInsufficientBalance', 'Insufficient prepaid balance'),
            IMMEDIATE_LIMIT_REACHED: safeT('errorImmediateLimitReached', 'You have reached your immediate orders limit'),
            TOO_MANY_PENDING: safeT('errorTooManyPending', 'Too many orders are pending confirmation'),
            MAX_JOBS_REACHED: safeT('errorMaxActiveJobsReached', 'You have reached your maximum active jobs limit'),
            PLANNED_JOB_DUE_SOON: safeT('errorPlannedDueSoon', 'You have a planned order due soon, finish or start it first'),
            ORDER_NOT_AVAILABLE: safeT('errorOrderNotAvailable', 'Order is no longer available'),
        };
        return map[code] || code;
    }, [safeT]);
    const normalizeActionMessage = useCallback((rawMessage, blockers = []) => {
        if (Array.isArray(blockers) && blockers.length) {
            return blockers.map(code => `- ${blockerLabel(code)}`).join('\n');
        }

        const message = String(rawMessage || '');
        const lowered = message.toLowerCase();
        if (lowered.includes('master already has an order in progress')) {
            return safeT('errorOneStartedOrder', 'You already have an order in progress');
        }
        if (lowered.includes('too early to start planned order')) {
            return safeT('errorPlannedTooEarly', 'It is too early to start this planned order');
        }
        if (lowered.includes('order no longer available') || lowered.includes('order is no longer available')) {
            return safeT('errorOrderNotAvailable', 'Order is no longer available');
        }
        if (lowered.includes('immediate orders limit')) {
            return safeT('errorImmediateLimitReached', 'You have reached your immediate orders limit');
        }
        if (lowered.includes('maximum active jobs limit') || lowered.includes('max jobs reached')) {
            return safeT('errorMaxActiveJobsReached', 'You have reached your maximum active jobs limit');
        }
        if (lowered.includes('planned order starting soon') || lowered.includes('planned job due soon')) {
            return safeT('errorPlannedDueSoon', 'You have a planned order due soon, finish or start it first');
        }
        return message || safeT('errorActionFailed', 'Action failed');
    }, [blockerLabel, safeT]);
    const localizeSuccessMessage = useCallback((rawMessage, fallbackKey, fallbackText) => {
        const message = String(rawMessage || '');
        const lowered = message.toLowerCase();
        if (lowered.includes('job started')) return safeT('toastJobStarted', 'Job started!');
        if (lowered.includes('job completed')) return safeT('toastJobCompleted', 'Job completed, awaiting confirmation');
        if (lowered.includes('order claimed')) return safeT('toastOrderClaimed', 'Order claimed!');
        if (lowered.includes('refused') || lowered.includes('canceled')) return safeT('toastJobRefused', 'Job canceled');
        if (message) return message;
        return safeT(fallbackKey, fallbackText);
    }, [safeT]);
    const actionSuccessMessage = useCallback((fn, rawMessage) => {
        if (fn === ordersService.startJob) return localizeSuccessMessage(rawMessage, 'toastJobStarted', 'Job started!');
        if (fn === ordersService.completeJob) return localizeSuccessMessage(rawMessage, 'toastJobCompleted', 'Job completed, awaiting confirmation');
        if (fn === ordersService.refuseJob) return localizeSuccessMessage(rawMessage, 'toastJobRefused', 'Job canceled');
        return localizeSuccessMessage(rawMessage, 'toastUpdated', 'Updated');
    }, [localizeSuccessMessage]);
    const {
        activeTab,
        setActiveTab,
        orderSection,
        setOrderSection,
        accountView,
        setAccountView,
    } = useMasterRouteState();

    const [user, setUser] = useState(null);
    const [availableOrders, setAvailableOrders] = useState([]);
    const [availableOrdersMeta, setAvailableOrdersMeta] = useState([]);
    const [myOrders, setMyOrders] = useState([]);
    const [financials, setFinancials] = useState(null);
    const [earnings, setEarnings] = useState([]);
    const [orderHistory, setOrderHistory] = useState([]);
    // Balance transactions for showing admin top-ups in History
    const [balanceTransactions, setBalanceTransactions] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [cancelReasons, setCancelReasons] = useState([]);

    const [headerHeight, setHeaderHeight] = useState(0);
    const [pagePool, setPagePool] = useState(1);
    const [totalPool, setTotalPool] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' });
    const [showFilters, setShowFilters] = useState(true);
    const [modalState, setModalState] = useState({ type: null, order: null });
    const [completeData, setCompleteData] = useState({});
    const [refuseData, setRefuseData] = useState({});
    const [activeSheetOrder, setActiveSheetOrder] = useState(null);
    const [selectedPoolOrderId, setSelectedPoolOrderId] = useState(null);
    const [sheetSnap, setSheetSnap] = useState('peek'); // 'peek' | 'half' | 'full'
    const [sheetModalVisible, setSheetModalVisible] = useState(false);
    const sheetAnim = useRef(new Animated.Value(0)).current;
    const sheetSnapAnim = useRef(new Animated.Value(0)).current;
    const filterAnim = useRef(new Animated.Value(showFilters ? 1 : 0)).current;
    const perfRef = useRef({
        mountTs: perfNow(),
        firstDataLogged: false,
        firstListLayoutLogged: false,
        criticalLoadSeq: 0,
        accountLoadSeq: 0,
        poolLoadSeq: 0,
        pageLoadSeq: 0,
        accountLoaded: false,
        accountLoadedAt: 0,
        filtersInitialized: false,
        lastFilterKey: '',
    });
    const filterDebounceRef = useRef(null);

    const { logout, user: authUser } = useAuth();
    const logPerf = useCallback((event, data = {}) => {
        if (!PERF_LOG_ENABLED) return;
        console.log(`${LOG_PREFIX}[PERF] ${event}`, data);
    }, []);
    const timedCall = useCallback(async (label, fn, meta = {}) => {
        const start = perfNow();
        try {
            const res = await fn();
            logPerf('api_done', { label, ms: roundMs(perfNow() - start), ok: true, ...meta });
            return res;
        } catch (error) {
            logPerf('api_done', { label, ms: roundMs(perfNow() - start), ok: false, error: error?.message, ...meta });
            throw error;
        }
    }, [logPerf]);

    useEffect(() => {
        loadCriticalData({ reset: true, reason: 'mount' });
        const task = InteractionManager.runAfterInteractions(() => {
            loadAccountData({ reason: 'post_mount' });
        });
        return () => task?.cancel?.();
    }, []);
    useEffect(() => {
        if (!authUser) {
            setUser(null);
            perfRef.current.accountLoaded = false;
            perfRef.current.accountLoadedAt = 0;
            perfRef.current.filtersInitialized = false;
            perfRef.current.lastFilterKey = '';
        }
    }, [authUser]);
    useEffect(() => {
        const userId = user?.id;
        if (!userId) return;
        const filterKey = JSON.stringify(filters);
        if (!perfRef.current.filtersInitialized) {
            perfRef.current.filtersInitialized = true;
            perfRef.current.lastFilterKey = filterKey;
            return;
        }
        if (perfRef.current.lastFilterKey === filterKey) return;
        perfRef.current.lastFilterKey = filterKey;
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
        }
        filterDebounceRef.current = setTimeout(() => {
            reloadPool({ reason: 'filters' });
        }, 280);
        return () => {
            if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        };
    }, [filters, user?.id]);
    useEffect(() => {
        Animated.timing(filterAnim, {
            toValue: showFilters ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [showFilters, filterAnim]);
    useEffect(() => {
        if (orderSection !== ORDER_SECTIONS.AVAILABLE) {
            if (selectedPoolOrderId) setSelectedPoolOrderId(null);
            return;
        }
        if (selectedPoolOrderId && !availableOrders.find(o => o.id == selectedPoolOrderId)) {
            setSelectedPoolOrderId(null);
        }
    }, [orderSection, availableOrders, selectedPoolOrderId]);

    useEffect(() => {
        if (activeTab !== MASTER_TABS.ORDERS) return;
        if (activeSheetOrder) return;
        const active = myOrders.find(o => o.status === ORDER_STATUS.STARTED);
        if (active) {
            setActiveSheetOrder(active);
            setSheetSnap('peek');
        }
    }, [activeTab, myOrders, activeSheetOrder]);

    useEffect(() => {
        if (activeSheetOrder && sheetSnap !== 'peek') {
            setSheetModalVisible(true);
            Animated.timing(sheetAnim, {
                toValue: 1,
                duration: 240,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: CAN_USE_NATIVE_DRIVER,
            }).start();
            return;
        }
        if (sheetModalVisible) {
            Animated.timing(sheetAnim, {
                toValue: 0,
                duration: 180,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: CAN_USE_NATIVE_DRIVER,
            }).start(({ finished }) => {
                if (finished) setSheetModalVisible(false);
            });
        }
    }, [activeSheetOrder, sheetSnap, sheetModalVisible, sheetAnim]);

    useEffect(() => {
        const target = sheetSnap === 'full' ? 1 : 0;
        Animated.timing(sheetSnapAnim, {
            toValue: target,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }).start();
    }, [sheetSnap, sheetSnapAnim]);

    useEffect(() => {
        if (!activeSheetOrder) return;
        const updated = myOrders.find(o => o.id === activeSheetOrder.id);
        if (!updated) return;
        if (updated.status !== activeSheetOrder.status) {
            if (TERMINAL_ORDER_STATUSES.includes(updated.status)) {
                setActiveSheetOrder(null);
                setSheetSnap('peek');
                return;
            }
            setActiveSheetOrder(updated);
            return;
        }
        const hasNewDetails = (
            (updated.full_address && updated.full_address !== activeSheetOrder.full_address)
            || (updated.orientir && updated.orientir !== activeSheetOrder.orientir)
            || (updated.area && updated.area !== activeSheetOrder.area)
            || (updated.client_phone && updated.client_phone !== activeSheetOrder.client_phone)
            || (updated.client_name && updated.client_name !== activeSheetOrder.client_name)
            || (updated.dispatcher_id && updated.dispatcher_id !== activeSheetOrder.dispatcher_id)
        );
        if (hasNewDetails) setActiveSheetOrder(updated);
    }, [myOrders, activeSheetOrder]);

    const {
        loadCriticalData,
        loadAccountData,
        reloadPool,
        onRefresh,
        onHeaderRefresh,
    } = useMasterDataLoader({
        authUser,
        user,
        filters,
        activeTab,
        setUser,
        setLoading,
        setRefreshing,
        setPagePool,
        setAvailableOrders,
        setAvailableOrdersMeta,
        setTotalPool,
        setMyOrders,
        setFinancials,
        setEarnings,
        setOrderHistory,
        setBalanceTransactions,
        setServiceTypes,
        setCancelReasons,
        setDistricts,
        perfRef,
        logPerf,
        timedCall,
        pageLimit: PAGE_LIMIT,
        perfNow,
        roundMs,
        perfTargets: PERF_TARGETS_MS,
        getCachedLookup,
        setCachedLookup,
    });
    useEffect(() => {
        if (activeTab !== MASTER_TABS.ACCOUNT) return;
        if (!perfRef.current.accountLoaded) {
            loadAccountData({ reason: 'account_tab' });
            return;
        }
        const stale = perfRef.current.accountLoadedAt && (Date.now() - perfRef.current.accountLoadedAt > 10 * 60 * 1000);
        if (stale) loadAccountData({ reason: 'account_tab_stale' });
    }, [activeTab, loadAccountData]);

    const handleLogout = async () => {
        try {
            await logout({ scope: 'local' });
        } catch (e) {
            console.error('Logout failed', e);
        } finally {
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
    };

    const {
        processedOrders,
        activeJobsCount,
        immediateOrdersCount,
        startedOrdersCount,
        pendingOrdersCount,
    } = useMasterOrderProcessing({
        availableOrders,
        myOrders,
        filters,
        orderSection,
    });
    const upsertOrderById = useCallback((list, order) => {
        if (!order) return list;
        const idx = list.findIndex(o => o.id == order.id);
        if (idx === -1) return [order, ...list];
        const next = [...list];
        next[idx] = { ...next[idx], ...order };
        return next;
    }, []);
    const removeOrderById = useCallback((list, id) => list.filter(o => o.id != id), []);
    const handleListLayout = useCallback(() => {
        if (perfRef.current.firstListLayoutLogged) return;
        perfRef.current.firstListLayoutLogged = true;
        const ms = roundMs(perfNow() - perfRef.current.mountTs);
        logPerf('first_list_layout', {
            ms,
            items: processedOrders.length,
            section: orderSection,
            targetMs: PERF_TARGETS_MS.firstListLayout,
            withinTarget: ms <= PERF_TARGETS_MS.firstListLayout,
        });
    }, [logPerf, orderSection, processedOrders.length]);

    const maxActiveJobs = Number(user?.max_active_jobs || 2);
    const maxImmediateOrders = Number(user?.max_immediate_orders || 1);
    const maxPendingOrders = Number(user?.max_pending_confirmation || 3);
    const totalPages = useMemo(() => Math.max(1, Math.ceil(totalPool / PAGE_LIMIT)), [totalPool]);
    const sheetAddress = activeSheetOrder?.full_address || activeSheetOrder?.address || '';
    const sheetArea = activeSheetOrder?.area || '';
    const sheetOrientir = activeSheetOrder?.orientir || activeSheetOrder?.landmark || '';
    const sheetClientName = activeSheetOrder?.client_name || activeSheetOrder?.client?.full_name || '';
    const sheetClientPhone = activeSheetOrder?.client_phone || activeSheetOrder?.client?.phone || '';
    const sheetDispatcherName = activeSheetOrder?.dispatcher?.full_name || activeSheetOrder?.dispatcher_name || '';
    const sheetDispatcherPhone = activeSheetOrder?.dispatcher?.phone || activeSheetOrder?.dispatcher_phone || '';
    const sheetCanSeeDetails = activeSheetOrder?.status === ORDER_STATUS.STARTED || activeSheetOrder?.status === ORDER_STATUS.CLAIMED;
    const activeSheetPlannedText = activeSheetOrder?.urgency === 'planned'
        ? formatPlannedDateTime(activeSheetOrder?.preferred_date, activeSheetOrder?.preferred_time, language)
        : '';
    const activeSheetPricingLabel = activeSheetOrder?.pricing_type === 'fixed'
        ? safeT('fixedPrice', 'Fixed price')
        : safeT('priceOpen', 'Open');
    const screenHeight = Dimensions.get('window').height || 800;
    const gridColumns = deviceUtils.getGridColumns();
    const initialRenderCount = gridColumns === 1 ? 6 : 8;
    const batchRenderCount = gridColumns === 1 ? 6 : 10;
    const tabBarHeight = Platform.OS === 'ios' ? 72 : 56;
    const sheetBottomInset = tabBarHeight + (insets?.bottom || 0); // keep above tab bar + safe area
    const sheetFooterHeight = activeSheetOrder?.status === ORDER_STATUS.STARTED ? 80 : 68; // reserve space for sticky actions
    const sheetBodyPaddingBottom = sheetFooterHeight + sheetBottomInset + 8;
    const sheetTopInset = Math.max(8, (insets?.top || 0) + 6);
    const sheetFullHeight = Math.max(0, screenHeight - sheetTopInset);
    const sheetHalfMin = sheetFooterHeight + sheetBottomInset + 320;
    const sheetHalfHeight = Math.min(sheetFullHeight - 16, Math.max(screenHeight * 0.75, sheetHalfMin));
    const sheetSnapTranslate = sheetSnapAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [sheetFullHeight - sheetHalfHeight, 0],
    });
    const sheetOpenTranslate = sheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [sheetFullHeight + 40, 0],
    });
    const filterSummaryHeight = 22;
    const filterDropdownHeight = filterAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
    const filterOverlayHeight = useMemo(
        () => Animated.add(new Animated.Value(filterSummaryHeight), filterDropdownHeight),
        [filterDropdownHeight]
    );
    const filterOverlayStaticHeight = filterSummaryHeight + (showFilters ? 40 : 0);
    const listTopPadding = orderSection === ORDER_SECTIONS.AVAILABLE
        ? filterOverlayStaticHeight + 16
        : 12;
    const baseBottomPadding = tabBarHeight + 60 + (insets?.bottom || 0);
    const sheetPeekPadding = activeSheetOrder?.status === ORDER_STATUS.STARTED && sheetSnap === 'peek' && !sheetModalVisible ? 90 : 0;
    const listBottomPadding = baseBottomPadding + sheetPeekPadding;
    const activeFilterCount = useMemo(() => {
        return ['urgency', 'service', 'area', 'pricing'].reduce((count, key) => (filters[key] && filters[key] !== 'all' ? count + 1 : count), 0);
    }, [filters]);

    const poolMeta = useMemo(
        () => (availableOrdersMeta.length ? availableOrdersMeta : availableOrders),
        [availableOrdersMeta, availableOrders]
    );
    const metaMatchesFilters = useCallback((row, currentFilters, ignoreKey) => {
        if (ignoreKey !== 'urgency' && currentFilters.urgency !== 'all' && row.urgency !== currentFilters.urgency) return false;
        if (ignoreKey !== 'service' && currentFilters.service !== 'all' && row.service_type !== currentFilters.service) return false;
        if (ignoreKey !== 'area' && currentFilters.area !== 'all' && row.area !== currentFilters.area) return false;
        if (ignoreKey !== 'pricing' && currentFilters.pricing !== 'all' && row.pricing_type !== currentFilters.pricing) return false;
        return true;
    }, []);
    const getMetaCount = useCallback((key, value) => {
        const base = poolMeta.filter(row => metaMatchesFilters(row, filters, key));
        if (!value || value === 'all') return base.length;
        const rowKey = key === 'service' ? 'service_type' : key === 'pricing' ? 'pricing_type' : key;
        return base.filter(row => row[rowKey] === value).length;
    }, [poolMeta, filters, metaMatchesFilters]);

    const availableServices = useMemo(() => {
        return [...new Set(poolMeta.map(o => o.service_type))].filter(Boolean).sort();
    }, [poolMeta]);

    const availableAreas = useMemo(() => {
        return [...new Set(poolMeta.map(o => o.area))].filter(Boolean).sort();
    }, [poolMeta]);

    const ensureSelectedOption = useCallback((options, value) => {
        if (!value || value === 'all') return options;
        return options.includes(value) ? options : [...options, value];
    }, []);

    const urgencyOptions = useMemo(() => {
        const base = ['emergency', 'urgent', 'planned'];
        const active = base.filter(opt => poolMeta.some(row => row.urgency === opt));
        const options = ['all', ...active];
        return ensureSelectedOption(options, filters.urgency);
    }, [poolMeta, filters.urgency, ensureSelectedOption]);

    const serviceOptions = useMemo(() => {
        const options = ['all', ...availableServices];
        return ensureSelectedOption(options, filters.service);
    }, [availableServices, filters.service, ensureSelectedOption]);

    const areaOptions = useMemo(() => {
        const options = ['all', ...availableAreas];
        return ensureSelectedOption(options, filters.area);
    }, [availableAreas, filters.area, ensureSelectedOption]);

    // Build translated labels for service types in filter dropdown
    const getServiceFilterLabel = (serviceCode) => {
        if (!serviceCode) return '';
        const normalized = serviceCode.toLowerCase().replace(/_/g, '');
        const keyMap = {
            plumbing: 'servicePlumbing',
            electrician: 'serviceElectrician',
            cleaning: 'serviceCleaning',
            carpenter: 'serviceCarpenter',
            repair: 'serviceRepair',
            installation: 'serviceInstallation',
            maintenance: 'serviceMaintenance',
            other: 'serviceOther',
            appliancerepair: 'serviceApplianceRepair',
            building: 'serviceBuilding',
            inspection: 'serviceInspection',
            hvac: 'serviceHvac',
            painting: 'servicePainting',
            flooring: 'serviceFlooring',
            roofing: 'serviceRoofing',
            landscaping: 'serviceLandscaping',
        };
        const translationKey = keyMap[normalized];
        return translationKey ? t(translationKey) : serviceCode.charAt(0).toUpperCase() + serviceCode.slice(1).replace(/_/g, ' ');
    };

    const serviceOptionLabels = useMemo(() => {
        const labels = {};
        serviceOptions.forEach(svc => {
            const baseLabel = svc === 'all' ? t('filterAll') : getServiceFilterLabel(svc);
            labels[svc] = `${baseLabel} (${getMetaCount('service', svc)})`;
        });
        return labels;
    }, [serviceOptions, language, getMetaCount]);

    const urgencyOptionLabels = useMemo(() => {
        const labels = {};
        urgencyOptions.forEach(opt => {
            const baseLabel = opt === 'all'
                ? t('filterAll')
                : t(`urgency${opt.charAt(0).toUpperCase() + opt.slice(1)}`);
            labels[opt] = `${baseLabel} (${getMetaCount('urgency', opt)})`;
        });
        return labels;
    }, [urgencyOptions, getMetaCount, language]);

    const areaOptionLabels = useMemo(() => {
        const labels = {};
        areaOptions.forEach(opt => {
            const baseLabel = opt === 'all' ? t('filterAll') : opt;
            labels[opt] = `${baseLabel} (${getMetaCount('area', opt)})`;
        });
        return labels;
    }, [areaOptions, getMetaCount, language]);


    const {
        actionLoading,
        handleClaim,
        handleAction,
        handleStart,
        handleOpenComplete,
        handleOpenRefuse,
        handleCopyAddress,
        handleCopyPhone,
        handlePoolPageChange,
    } = useMasterActions({
        availableOrders,
        financials,
        loadCriticalData,
        localizeSuccessMessage,
        normalizeActionMessage,
        actionSuccessMessage,
        safeT,
        showToast,
        timedCall,
        logPerf,
        removeOrderById,
        upsertOrderById,
        activeSheetOrder,
        myOrders,
        userId: user?.id,
        cancelReasons,
        setCancelReasons,
        getCachedLookup,
        setCachedLookup,
        setSelectedPoolOrderId,
        setActiveSheetOrder,
        setSheetSnap,
        setAvailableOrders,
        setTotalPool,
        setMyOrders,
        setModalState,
        filters,
        totalPages,
        perfRef,
        setPagePool,
        pageLimit: PAGE_LIMIT,
        perfNow,
        roundMs,
        perfTargets: PERF_TARGETS_MS,
        t,
    });

    const handleOpenOrderSheet = useCallback((order) => {
        if (!order) return;
        const normalized = normalizeMasterOrder(order, ORDER_STATUS.PLACED);
        if (!normalized) return;
        if ([ORDER_STATUS.PLACED, ORDER_STATUS.REOPENED].includes(normalized.status)) {
            setSelectedPoolOrderId(normalized.id);
            return;
        }
        setActiveSheetOrder(normalized);
        setSheetSnap('full');
    }, []);

    const handleCloseOrderSheet = useCallback(() => {
        if (activeSheetOrder && [ORDER_STATUS.PLACED, ORDER_STATUS.REOPENED].includes(activeSheetOrder.status)) {
            setActiveSheetOrder(null);
            setSheetSnap('peek');
            return;
        }
        setSheetSnap('peek');
    }, [activeSheetOrder]);

    const sheetPan = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
        onPanResponderRelease: (_, gesture) => {
            if (gesture.dy > 80) {
                handleCloseOrderSheet();
            }
        }
    }), [handleCloseOrderSheet]);
    return (
        <LinearGradient
            colors={isDark ? ['#0b1220', '#111827'] : ['#f8fafc', '#eef2ff']}
            style={styles.container}
        >
            <View
                style={[styles.headerShell, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}
                onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
            >
                <Header
                    styles={styles}
                    user={user}
                    financials={financials}
                    onLogout={handleLogout}
                    onLanguageToggle={cycleLanguage}
                    onThemeToggle={toggleTheme}
                    onRefresh={onHeaderRefresh}
                    topInset={insets?.top || 0}
                />
                {activeTab === MASTER_TABS.ORDERS && (
                    <View style={styles.headerExtras}>
                        <SectionToggle
                            styles={styles}
                            sections={[
                                { key: ORDER_SECTIONS.AVAILABLE, label: t('sectionAvailable'), count: totalPool },
                                { key: ORDER_SECTIONS.MY_JOBS, label: t('sectionMyJobs'), count: activeJobsCount }
                            ]}
                            activeSection={orderSection}
                            onSectionChange={setOrderSection}
                        />
                    </View>
                )}
            </View>
            {activeTab === MASTER_TABS.ORDERS && orderSection === ORDER_SECTIONS.AVAILABLE && (
                <Animated.View
                    style={[
                        styles.filterOverlay,
                        {
                            top: headerHeight + 6,
                            height: filterOverlayHeight,
                            backgroundColor: theme.bgSecondary,
                            borderColor: theme.borderPrimary,
                        }
                    ]}
                >
                    <TouchableOpacity
                        style={styles.filterSummaryRow}
                        onPress={() => setShowFilters(!showFilters)}
                    >
                        <View style={styles.filterSummaryLeft}>
                            <Filter size={14} color={theme.textSecondary} />
                            <Text style={[styles.filterSummaryText, { color: theme.textPrimary }]}>
                                {safeT('filterTitle', 'Filters')} ({activeFilterCount})
                            </Text>
                        </View>
                        {showFilters ? <ChevronUp size={16} color={theme.textSecondary} /> : <ChevronDown size={16} color={theme.textSecondary} />}
                    </TouchableOpacity>
                    <Animated.View style={[styles.filterPanel, { height: filterDropdownHeight, opacity: filterAnim }]}>
                        <View style={styles.filterPanelInner}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent} style={styles.filterScroll}>
                                <Dropdown styles={styles} label={t('filterUrgency')} value={filters.urgency} options={urgencyOptions} optionLabels={urgencyOptionLabels} onChange={v => setFilters({ ...filters, urgency: v })} />
                                <Dropdown styles={styles} label={t('filterService')} value={filters.service} options={serviceOptions} optionLabels={serviceOptionLabels} onChange={v => setFilters({ ...filters, service: v })} />
                                <Dropdown styles={styles} label={t('filterArea')} value={filters.area} options={areaOptions} optionLabels={areaOptionLabels} onChange={v => setFilters({ ...filters, area: v })} />
                            </ScrollView>
                            {(filters.urgency !== 'all' || filters.service !== 'all' || filters.area !== 'all' || filters.pricing !== 'all') && (
                                <TouchableOpacity
                                    style={[styles.clearFiltersBtn, { borderColor: theme.textMuted }]}
                                    onPress={() => setFilters({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' })}
                                >
                                    <X size={14} color={theme.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </Animated.View>
                </Animated.View>
            )}

            {loading && !refreshing ? (
                activeTab === MASTER_TABS.ORDERS ? (
                    <ScrollView
                        contentContainerStyle={[
                            styles.list,
                            { paddingTop: listTopPadding, paddingBottom: listBottomPadding }
                        ]}
                        showsVerticalScrollIndicator={false}
                    >
                        {(() => {
                            const columns = gridColumns;
                            const cardMargin = 6;
                            const containerPadding = 16;
                            const totalGaps = (columns - 1) * (cardMargin * 2);
                            const availableWidth = Dimensions.get('window').width - (containerPadding * 2) - totalGaps;
                            const cardWidth = columns === 1 ? '100%' : (availableWidth / columns) - cardMargin;
                            return Array.from({ length: 4 }).map((_, index) => (
                                <SkeletonOrderCard key={`skeleton-${index}`} styles={styles} width={cardWidth} />
                            ));
                        })()}
                    </ScrollView>
                ) : (
                    <View style={styles.center}><ActivityIndicator color={theme.accentIndigo} size="large" /></View>
                )
            ) : activeTab === MASTER_TABS.ACCOUNT ? (
                <MyAccountTab
                    styles={styles}
                    user={user}
                    financials={financials}
                    earnings={earnings}
                    orderHistory={orderHistory}
                    balanceTransactions={balanceTransactions}
                    districts={districts}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    accountView={accountView}
                    setAccountView={setAccountView}
                />
            ) : (
                <FlatList
                    data={processedOrders}
                    key={gridColumns}
                    numColumns={gridColumns}
                    keyExtractor={item => item.id}
                    onLayout={handleListLayout}
                    initialNumToRender={initialRenderCount}
                    maxToRenderPerBatch={batchRenderCount}
                    windowSize={7}
                    updateCellsBatchingPeriod={50}
                    removeClippedSubviews={Platform.OS === 'android'}
                    contentContainerStyle={[
                        styles.list,
                        { paddingTop: listTopPadding, paddingBottom: listBottomPadding }
                    ]}
                    columnWrapperStyle={gridColumns > 1 ? styles.colWrapper : null} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}
                    ListHeaderComponent={
                        orderSection === ORDER_SECTIONS.MY_JOBS ? (
                            <View style={[styles.limitsCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                <Text style={[styles.limitsTitle, { color: theme.textPrimary }]}>
                                    {safeT('myJobsLimitsTitle', 'Current limits')}
                                </Text>
                                <View style={styles.limitsRow}>
                                    <View style={[styles.limitBadge, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                                        <Text style={[styles.limitBadgeLabel, { color: theme.textMuted }]}>
                                            {safeT('myJobsLimitActive', 'Active jobs')}
                                        </Text>
                                        <Text style={[styles.limitBadgeValue, { color: theme.textPrimary }]}>
                                            {activeJobsCount}/{maxActiveJobs}
                                        </Text>
                                    </View>
                                    <View style={[styles.limitBadge, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                                        <Text style={[styles.limitBadgeLabel, { color: theme.textMuted }]}>
                                            {safeT('myJobsLimitPending', 'Awaiting confirmation')}
                                        </Text>
                                        <Text style={[styles.limitBadgeValue, { color: theme.textPrimary }]}>
                                            {pendingOrdersCount}/{maxPendingOrders}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : null
                    }
                    renderItem={({ item }) => (
                        <OrderCard
                            order={item}
                            isPool={orderSection === ORDER_SECTIONS.AVAILABLE}
                            isSelected={orderSection === ORDER_SECTIONS.AVAILABLE && selectedPoolOrderId === item.id}
                            canClaim={Boolean(user?.is_verified && !financials?.balanceBlocked)}
                            actionLoading={actionLoading}
                            onClaim={handleClaim}
                            onStart={handleStart}
                            onCopyAddress={handleCopyAddress}
                            onComplete={handleOpenComplete}
                            onRefuse={handleOpenRefuse}
                            onOpen={handleOpenOrderSheet}
                        />
                    )}
                    ListFooterComponent={
                        orderSection === ORDER_SECTIONS.AVAILABLE && totalPages > 1 ? (
                            <View style={[styles.paginationBar, { borderColor: theme.borderPrimary }]}>
                                <TouchableOpacity
                                    style={[styles.paginationBtn, { borderColor: theme.borderPrimary, opacity: pagePool > 1 ? 1 : 0.4 }]}
                                    disabled={pagePool <= 1 || actionLoading}
                                    onPress={() => handlePoolPageChange(pagePool - 1)}
                                >
                                    <ChevronLeft size={16} color={theme.textSecondary} />
                                </TouchableOpacity>
                                <Text style={[styles.paginationInfo, { color: theme.textMuted }]}>
                                    {pagePool} / {totalPages}
                                </Text>
                                <TouchableOpacity
                                    style={[styles.paginationBtn, { borderColor: theme.borderPrimary, opacity: pagePool < totalPages ? 1 : 0.4 }]}
                                    disabled={pagePool >= totalPages || actionLoading}
                                    onPress={() => handlePoolPageChange(pagePool + 1)}
                                >
                                    <ChevronRight size={16} color={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        ) : <View style={{ height: 24 }} />
                    }
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Inbox size={48} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted, marginTop: 10 }}>
                                {orderSection === ORDER_SECTIONS.AVAILABLE
                                    ? safeT('emptyPoolTitle', 'No available orders')
                                    : safeT('emptyJobsTitle', 'No active jobs')}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Bottom Tabs */}
            <View style={[styles.bottomBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.tabBarBorder }]}>
                <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab(MASTER_TABS.ORDERS)}>
                    <ClipboardList size={22} color={activeTab === MASTER_TABS.ORDERS ? theme.accentIndigo : theme.textSecondary} />
                    <Text style={[styles.tabLabel, { color: activeTab === MASTER_TABS.ORDERS ? theme.accentIndigo : theme.textSecondary }]}>{t('tabOrders')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab(MASTER_TABS.ACCOUNT)}>
                    <User size={22} color={activeTab === MASTER_TABS.ACCOUNT ? theme.accentIndigo : theme.textSecondary} />
                    <Text style={[styles.tabLabel, { color: activeTab === MASTER_TABS.ACCOUNT ? theme.accentIndigo : theme.textSecondary }]}>{t('tabMyAccount')}</Text>
                </TouchableOpacity>
            </View>

            {/* Active Order Bottom Sheet */}
            {activeSheetOrder && sheetModalVisible && (
                <Modal visible transparent animationType="none" onRequestClose={handleCloseOrderSheet}>
                    <View style={styles.sheetModalRoot}>
                        <AnimatedPressable style={[styles.sheetBackdrop, { opacity: sheetAnim }]} onPress={handleCloseOrderSheet} />
                        <Animated.View
                            style={[
                                styles.sheetContainer,
                                {
                                    height: sheetFullHeight,
                                    transform: [{
                                        translateY: Animated.add(sheetOpenTranslate, sheetSnapTranslate)
                                    }]
                                }
                            ]}
                            {...sheetPan.panHandlers}
                        >
                            <Pressable style={[styles.modalContent, styles.claimModalContent, { backgroundColor: theme.bgSecondary }]} onPress={() => {}}>
                                <LinearGradient
                                    colors={isDark ? ['#111827', '#0f172a'] : ['#ffffff', '#f1f5f9']}
                                    style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }]}
                                />
                                <Pressable style={styles.claimHandle} onPress={() => setSheetSnap(sheetSnap === 'half' ? 'full' : 'half')} />
                                <View style={styles.sheetContent}>
                                    <ScrollView
                                        style={styles.sheetBody}
                                        contentContainerStyle={[styles.sheetBodyContent, { paddingBottom: sheetBodyPaddingBottom }]}
                                        showsVerticalScrollIndicator={false}
                                    >
                                    <View style={styles.sheetHeaderBlock}>
                                        <View style={styles.claimHeaderRow}>
                                            <View style={styles.claimHeaderText}>
                                                <View style={styles.sheetTitleRow}>
                                                    <Text style={[styles.claimTitle, { color: theme.textPrimary }]}>
                                                        {safeT('activeOrderTitle', 'Active order')}
                                                    </Text>
                                                    <View style={[styles.sheetStatusPill, { backgroundColor: `${theme.accentIndigo}20` }]}>
                                                        <Text style={[styles.sheetStatusText, { color: theme.accentIndigo }]}>
                                                            {getOrderStatusLabel(activeSheetOrder.status, t)}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <TouchableOpacity
                                                style={[styles.claimCloseBtn, { backgroundColor: `${theme.borderSecondary}55` }]}
                                                onPress={handleCloseOrderSheet}
                                            >
                                                <ChevronDown size={18} color={theme.textMuted} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <View style={[styles.claimDetails, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
                                        <View style={styles.sheetHeroRow}>
                                            <View style={[styles.sheetHeroCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                <Text style={[styles.sheetHeroLabel, { color: theme.textMuted }]}>{safeT('serviceType', 'Service')}</Text>
                                                <Text style={[styles.sheetValueBase, styles.sheetValuePrimary, { color: theme.textPrimary }]}>
                                                    {getServiceLabel(activeSheetOrder.service_type, t)}
                                                </Text>
                                            </View>
                                            <View style={[styles.sheetHeroCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                <Text style={[styles.sheetHeroLabel, { color: theme.textMuted }]}>{safeT('price', 'Price')}</Text>
                                                <Text style={[styles.sheetValueBase, styles.sheetValuePrimary, { color: theme.accentSuccess }]}>
                                                    {activeSheetOrder.final_price ?? activeSheetOrder.initial_price ?? activeSheetOrder.callout_fee ?? safeT('priceOpen', 'Open')}
                                                </Text>
                                                <Text style={[styles.sheetMetaInline, { color: theme.textMuted }]}>
                                                    {activeSheetPricingLabel}
                                                </Text>
                                            </View>
                                        </View>
                                        {activeSheetPlannedText ? (
                                            <View style={[styles.sheetInfoCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                <View style={styles.sheetInfoMain}>
                                                    <Clock size={16} color={theme.textMuted} />
                                                    <View style={styles.sheetInfoText}>
                                                        <Text style={[styles.sheetInfoLabel, { color: theme.textMuted }]}>{safeT('urgencyPlanned', 'Planned')}</Text>
                                                        <Text style={[styles.sheetValueBase, styles.sheetValueSecondary, { color: theme.textPrimary }]} numberOfLines={1}>
                                                            {activeSheetPlannedText}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        ) : null}
                                        {sheetCanSeeDetails ? (
                                            <View style={styles.sheetDetailsBlock}>
                                                {sheetAddress ? (
                                                    <View style={[styles.sheetInfoCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                        <View style={styles.sheetInfoMain}>
                                                            <View style={styles.sheetInfoText}>
                                                                <View style={styles.sheetAddressBlock}>
                                                                    {sheetArea ? (
                                                                        <View style={styles.sheetFieldBlock}>
                                                                            <Text style={[styles.sheetFieldLabel, { color: theme.textMuted }]}>{safeT('district', 'District')}</Text>
                                                                            <Text style={[styles.sheetValueBase, styles.sheetValueSecondary, { color: theme.textPrimary }]} numberOfLines={1}>
                                                                                {sheetArea}
                                                                            </Text>
                                                                        </View>
                                                                    ) : null}
                                                                    {sheetOrientir ? (
                                                                        <View style={styles.sheetFieldBlock}>
                                                                            <Text style={[styles.sheetFieldLabel, { color: theme.textMuted }]}>{safeT('labelOrientir', 'Landmark')}</Text>
                                                                            <Text style={[styles.sheetValueBase, styles.sheetValueSecondary, { color: theme.textPrimary }]} numberOfLines={1}>
                                                                                {sheetOrientir}
                                                                            </Text>
                                                                        </View>
                                                                    ) : null}
                                                                    {sheetAddress ? (
                                                                        <View style={styles.sheetFieldBlock}>
                                                                            <Text style={[styles.sheetFieldLabel, { color: theme.textMuted }]}>{safeT('address', 'Address')}</Text>
                                                                            <Text style={[styles.sheetValueBase, styles.sheetValuePrimary, { color: theme.textPrimary }]} numberOfLines={2}>
                                                                                {sheetAddress}
                                                                            </Text>
                                                                        </View>
                                                                    ) : null}
                                                                </View>
                                                            </View>
                                                        </View>
                                                        <TouchableOpacity
                                                            style={[styles.sheetIconBtn, { backgroundColor: `${theme.accentIndigo}14` }]}
                                                            onPress={() => handleCopyAddress(sheetAddress)}
                                                        >
                                                            <Copy size={16} color={theme.accentIndigo} />
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : null}
                                                {(sheetClientName || sheetClientPhone) ? (
                                                    <View style={[styles.sheetInfoCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                        <View style={styles.sheetInfoMain}>
                                                            <View style={styles.sheetInfoText}>
                                                                <Text style={[styles.sheetInfoLabel, { color: theme.textMuted }]}>{safeT('clientName', 'Client')}</Text>
                                                                <Text style={[styles.sheetValueBase, styles.sheetValuePrimary, { color: theme.textPrimary }]} numberOfLines={1}>
                                                                    {sheetClientName || '-'}
                                                                </Text>
                                                                {sheetClientPhone ? (
                                                                    <View style={styles.sheetPhoneRow}>
                                                                        <Text style={[styles.sheetValueBase, styles.sheetValuePhone, { color: theme.textPrimary }]}>
                                                                            {sheetClientPhone}
                                                                        </Text>
                                                                        <View style={styles.sheetInfoActions}>
                                                                            <TouchableOpacity
                                                                                style={[styles.sheetIconBtn, { backgroundColor: `${theme.accentIndigo}14` }]}
                                                                                onPress={() => handleCopyPhone(sheetClientPhone)}
                                                                            >
                                                                                <Copy size={16} color={theme.accentIndigo} />
                                                                            </TouchableOpacity>
                                                                            <TouchableOpacity
                                                                                style={[styles.sheetIconBtn, { backgroundColor: `${theme.accentSuccess}14` }]}
                                                                                onPress={() => Linking.openURL(`tel:${sheetClientPhone}`)}
                                                                            >
                                                                                <Phone size={16} color={theme.accentSuccess} />
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    </View>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                    </View>
                                                ) : null}
                                                {(sheetDispatcherName || sheetDispatcherPhone) ? (
                                                    <View style={[styles.sheetInfoCard, { backgroundColor: theme.bgCard, borderColor: theme.accentIndigo }]}>
                                                        <View style={styles.sheetInfoMain}>
                                                            <View style={styles.sheetInfoText}>
                                                                <Text style={[styles.sheetInfoLabel, { color: theme.textMuted }]}>{safeT('dispatcherLabel', 'Dispatcher')}</Text>
                                                                <Text style={[styles.sheetValueBase, styles.sheetValueSecondary, { color: theme.textPrimary }]} numberOfLines={1}>
                                                                    {sheetDispatcherName || '-'}
                                                                </Text>
                                                                {sheetDispatcherPhone ? (
                                                                    <View style={styles.sheetPhoneRow}>
                                                                        <Text style={[styles.sheetValueBase, styles.sheetValuePhone, { color: theme.textPrimary }]}>
                                                                            {sheetDispatcherPhone}
                                                                        </Text>
                                                                        <View style={styles.sheetInfoActions}>
                                                                            <TouchableOpacity
                                                                                style={[styles.sheetIconBtn, { backgroundColor: `${theme.accentIndigo}14` }]}
                                                                                onPress={() => handleCopyPhone(sheetDispatcherPhone)}
                                                                            >
                                                                                <Copy size={16} color={theme.accentIndigo} />
                                                                            </TouchableOpacity>
                                                                            <TouchableOpacity
                                                                                style={[styles.sheetIconBtn, { backgroundColor: `${theme.accentSuccess}14` }]}
                                                                                onPress={() => Linking.openURL(`tel:${sheetDispatcherPhone}`)}
                                                                            >
                                                                                <Phone size={16} color={theme.accentSuccess} />
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    </View>
                                                                ) : null}
                                                            </View>
                                                        </View>
                                                    </View>
                                                ) : null}
                                            </View>
                                        ) : (
                                            <View style={styles.sheetDetailsBlock}>
                                                <View style={[styles.sheetInfoCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                                    <View style={styles.sheetInfoMain}>
                                                        <View style={styles.sheetInfoText}>
                                                            <Text style={[styles.sheetInfoLabel, { color: theme.textMuted }]}>{safeT('address', 'Address')}</Text>
                                                            <Text style={[styles.sheetInfoValue, { color: theme.textSecondary }]}>
                                                                {safeT('cardStartToSeeAddress', 'Start job to see address')}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                    </ScrollView>
                                </View>
                                <View style={[styles.sheetFooter, { backgroundColor: theme.bgSecondary, borderTopColor: theme.borderPrimary, paddingBottom: sheetBottomInset }]}>
                                    <View style={styles.sheetFooterActions}>
                                        {activeSheetOrder.status === ORDER_STATUS.CLAIMED && (
                                            <TouchableOpacity
                                                style={[styles.primarySheetButton, { backgroundColor: theme.accentIndigo, shadowColor: theme.accentIndigo, shadowOpacity: 0.35 }]}
                                                disabled={actionLoading}
                                                onPress={() => handleStart(activeSheetOrder.id)}
                                            >
                                                {actionLoading ? (
                                                    <ActivityIndicator color="#fff" />
                                                ) : (
                                                    <Text style={styles.primarySheetButtonText}>{safeT('actionStart', 'Start job')}</Text>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        {activeSheetOrder.status === ORDER_STATUS.STARTED && (
                                            <>
                                                <TouchableOpacity
                                                    style={[styles.secondarySheetButton, { borderColor: theme.accentDanger, backgroundColor: `${theme.accentDanger}12`, shadowColor: theme.accentDanger, shadowOpacity: 0.25 }]}
                                                    onPress={() => handleOpenRefuse(activeSheetOrder)}
                                                >
                                                    <Text style={[styles.secondarySheetButtonText, { color: theme.accentDanger }]}>
                                                        {safeT('actionCancel', 'Cancel')}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.primarySheetButton, { backgroundColor: theme.accentSuccess, shadowColor: theme.accentSuccess, shadowOpacity: 0.35 }]}
                                                    onPress={() => handleOpenComplete(activeSheetOrder)}
                                                >
                                                    <Text style={styles.primarySheetButtonText}>{safeT('actionComplete', 'Complete')}</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </View>
                                </View>
                            </Pressable>
                        </Animated.View>
                    </View>
                </Modal>
            )}
            {activeTab === MASTER_TABS.ORDERS && activeSheetOrder?.status === ORDER_STATUS.STARTED && sheetSnap === 'peek' && !sheetModalVisible && (
                <Pressable
                    style={[styles.sheetPeek, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary, bottom: sheetBottomInset + 20 }]}
                    onPress={() => setSheetSnap('full')}
                >
                    <View style={styles.sheetPeekLeft}>
                        <View style={styles.sheetPeekTopRow}>
                            <Text style={[styles.sheetPeekLabel, { color: theme.textMuted }]}>{safeT('activeOrderTitle', 'Active order')}</Text>
                            <View style={[styles.sheetPeekStatusPill, { backgroundColor: `${theme.accentIndigo}18` }]}>
                                <Text style={[styles.sheetPeekStatusText, { color: theme.accentIndigo }]}>{getOrderStatusLabel(activeSheetOrder.status, t)}</Text>
                            </View>
                        </View>
                        <Text style={[styles.sheetPeekValue, { color: theme.textPrimary }]} numberOfLines={1}>
                            {getServiceLabel(activeSheetOrder.service_type, t)}
                        </Text>
                    </View>
                    <View style={[styles.sheetPeekChevron, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                        <ChevronUp size={16} color={theme.textMuted} />
                    </View>
                </Pressable>
            )}

            {/* Complete Modal */}
            {modalState.type === 'complete' && modalState.order && (
                <Modal visible transparent animationType="slide" onRequestClose={() => setModalState({ type: null, order: null })}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: theme.bgSecondary }]}>
                            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{t('modalCompleteTitle')}</Text>
                            <TextInput style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]} placeholder={t('modalFinalPrice')} placeholderTextColor={theme.textMuted} keyboardType="numeric" value={completeData.finalPrice || ''} onChangeText={text => setCompleteData({ ...completeData, finalPrice: sanitizeNumberInput(text) })} />
                            <TextInput style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]} placeholder={t('modalWorkPerformed')} placeholderTextColor={theme.textMuted} multiline numberOfLines={3} value={completeData.workPerformed || ''} onChangeText={text => setCompleteData({ ...completeData, workPerformed: text })} />
                            <TextInput style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]} placeholder={t('modalHoursWorked')} placeholderTextColor={theme.textMuted} keyboardType="numeric" value={completeData.hoursWorked || ''} onChangeText={text => setCompleteData({ ...completeData, hoursWorked: sanitizeNumberInput(text) })} />
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.borderSecondary }]} onPress={() => { setModalState({ type: null, order: null }); setCompleteData({}); }}><Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>{t('actionBack')}</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.accentSuccess, flex: 1 }]} onPress={() => {
                                    const parsedFinal = parseFloat(completeData.finalPrice);
                                    const calloutFee = modalState.order.callout_fee;
                                    if (calloutFee !== null && calloutFee !== undefined && !isNaN(parsedFinal) && parsedFinal < calloutFee) {
                                        showToast?.(t('errorFinalBelowCallout') || 'Final price cannot be lower than call-out fee', 'error');
                                        return;
                                    }
                                    handleAction(ordersService.completeJob, modalState.order.id, user.id, { finalPrice: parsedFinal, workPerformed: completeData.workPerformed, hoursWorked: parseFloat(completeData.hoursWorked) || null });
                                    setCompleteData({});
                                }}><Text style={styles.modalButtonText}>{t('actionSubmit')}</Text></TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Refuse Modal */}
            {modalState.type === 'refuse' && modalState.order && (
                <Modal visible transparent animationType="slide" onRequestClose={() => setModalState({ type: null, order: null })}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: theme.bgSecondary }]}>
                            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{t('modalCancelTitle')}</Text>
                            <Text style={[styles.modalLabel, { color: theme.textMuted }]}>{t('modalSelectReason')}</Text>
                            <ScrollView style={{ maxHeight: 200 }}>
                                {/* Render cancellation reasons with localized names */}
                                {cancelReasons.map(r => {
                                    // Get localized reason name based on current language
                                    const reasonLabel = language === 'ru' ? (r.name_ru || r.name_en)
                                        : language === 'kg' ? (r.name_kg || r.name_en)
                                            : r.name_en;
                                    return (
                                        <TouchableOpacity
                                            key={r.code}
                                            style={[styles.reasonItem, {
                                                backgroundColor: refuseData.reason === r.code ? `${theme.accentIndigo}15` : theme.bgCard,
                                                borderColor: refuseData.reason === r.code ? theme.accentIndigo : theme.borderPrimary
                                            }]}
                                            onPress={() => setRefuseData({ ...refuseData, reason: r.code })}
                                        >
                                            <Text style={{ color: refuseData.reason === r.code ? theme.accentIndigo : theme.textPrimary }}>{reasonLabel}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            <TextInput style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary, marginTop: 10 }]} placeholder={t('modalAdditionalNotes')} placeholderTextColor={theme.textMuted} multiline numberOfLines={2} value={refuseData.notes || ''} onChangeText={text => setRefuseData({ ...refuseData, notes: text })} />
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.borderSecondary }]} onPress={() => { setModalState({ type: null, order: null }); setRefuseData({}); }}><Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>{t('actionBack')}</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.accentDanger, flex: 1 }]} disabled={!refuseData.reason} onPress={async () => {
                                    if (!refuseData.reason) { showToast?.(safeT('errorSelectReason', 'Please select a reason'), 'error'); return; }
                                    const res = await handleAction(ordersService.refuseJob, modalState.order.id, user.id, refuseData.reason, refuseData.notes);
                                    if (res?.success) {
                                        setActiveSheetOrder(null);
                                        setSheetSnap('peek');
                                        setSheetModalVisible(false);
                                    }
                                    setRefuseData({});
                                }}><Text style={styles.modalButtonText}>{t('actionSubmit')}</Text></TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}
        </LinearGradient>
    );
};

export default function MasterDashboard(props) {
    return <ThemeProvider><LocalizationProvider><DashboardContent {...props} /></LocalizationProvider></ThemeProvider>;
}
