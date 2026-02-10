/**
 * Dispatcher Dashboard - v5 Enhanced
 * Features: Queue with filters, Grid/List view, Details Drawer, Master Assignment,
 * Draft saving, Recent Addresses, Internal Notes
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, TouchableOpacity,
    Modal, TextInput, ScrollView, ActivityIndicator, Alert, Platform,
    Dimensions, Linking, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import ordersService, { ORDER_STATUS } from '../services/orders';
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
    SERVICE_TYPES,
    STORAGE_KEYS,
} from './dispatcher/constants';
import { generateIdempotencyKey, sanitizeNumberInput } from './dispatcher/utils/formHelpers';
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

export default function DispatcherDashboard({ navigation, route }) {
    const { showToast } = useToast();
    const { translations, language, cycleLanguage, setLanguage, t } = useLocalization();
    const TRANSLATIONS = translations;
    const { logout, user: authUser } = useAuth();
    const perf = useDispatcherPerf();

    // User & Data
    const [user, setUser] = useState(route.params?.user || null);
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

    // UI States
    const { activeTab, setActiveTab } = useDispatcherRouting({ navigation, route });
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDark, setIsDark] = useState(true); // Theme state
    const [actionLoading, setActionLoading] = useState(false);
    const [page, setPage] = useState(1); // Pagination state
    const [statsTooltip, setStatsTooltip] = useState(null);
    const [statsInfo, setStatsInfo] = useState(null);
    const [statsGridWidth, setStatsGridWidth] = useState(0);
    const statsTooltipTimer = useRef(null);

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

    const handleRefresh = useCallback(async () => {
        await onRefresh({ includeStats: activeTab === 'stats', statsDays: statsWindowDays });
    }, [onRefresh, activeTab, statsWindowDays]);

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
        setMasters(data || []);
    }, [loadMasters]);

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
        />
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
        const canAssignMaster = ['placed', 'reopened'].includes(detailsOrder.status);
        const canCancelOrder = ['placed', 'reopened', 'expired', 'canceled_by_master'].includes(detailsOrder.status);

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
                                {!isEditing && (
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
                                                {isCurrentHandler && (
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

                                    {detailsOrder?.master && (
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
                                    {['canceled_by_master', 'canceled_by_client'].includes(detailsOrder.status) && (
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
                                        {activeJobs}/{maxJobs ?? '-'} {TRANSLATIONS[language].labelJobs}
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
            {renderDetailsDrawer()}
            {renderPaymentModal()}
            {renderAssignModal()}
            {renderMasterDetailsModal()}
            {renderPickerModal()}
        </LinearGradient>
    );
}



