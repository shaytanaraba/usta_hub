/**
 * Admin Dashboard - V5 High Fidelity
 * Replicates the "Deep Navy" web dashboard look with sidebar navigation and rich charts.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';

// Services & Context
import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import { useToast } from '../contexts/ToastContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';

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

const sanitizeNumberInput = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;
};

const formatNumber = (value) => (Number.isFinite(value) ? Number(value).toLocaleString() : '—');
const formatMoney = (value) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString()}` : '—');
const formatPercent = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—');
const hoursSince = (dateValue) => {
    if (!dateValue) return null;
    const ts = new Date(dateValue).getTime();
    if (Number.isNaN(ts)) return null;
    return (Date.now() - ts) / 3600000;
};
const normalizeStatus = (status) => String(status || '').toLowerCase();
const COMPLETED_STATUSES = new Set(['completed', 'confirmed']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled', 'canceled_by_client', 'canceled_by_master', 'canceled_by_admin']);
const getAnalyticsColumns = () => {
    if (SCREEN_WIDTH >= 1024) return 3;
    if (SCREEN_WIDTH >= 768) return 2;
    return 1;
};

const AnalyticsMetricCard = ({ label, value, subLabel, onPress, isDark, sparkData }) => (
    <TouchableOpacity
        style={[styles.analyticsMetricCard, !isDark && styles.cardLight]}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
    >
        <View style={styles.analyticsMetricTopRow}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.analyticsMetricLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>{label}</Text>
                <Text style={[styles.analyticsMetricValue, !isDark && styles.textDark]}>{value}</Text>
            </View>
            {sparkData?.length ? <MiniBars data={sparkData} isDark={isDark} height={22} barWidth={5} /> : null}
        </View>
        {subLabel ? (
            <Text style={[styles.analyticsMetricSub, { color: isDark ? '#94a3b8' : '#64748b' }]}>{subLabel}</Text>
        ) : null}
    </TouchableOpacity>
);

const AnalyticsListCard = ({ title, items, emptyLabel, onPress, isDark, actionLabel = 'View' }) => (
    <TouchableOpacity
        style={[styles.analyticsListCard, !isDark && styles.cardLight]}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
    >
        <View style={styles.analyticsListHeader}>
            <Text style={[styles.analyticsListTitle, !isDark && styles.textDark]}>{title}</Text>
            {onPress ? (
                <Text style={[styles.analyticsListAction, { color: '#3b82f6' }]}>{actionLabel}</Text>
            ) : null}
        </View>
        {items?.length ? (
            items.slice(0, 4).map((item, idx) => (
                <View key={`${item.label}-${idx}`} style={styles.analyticsListItem}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.analyticsListLabel, { color: isDark ? '#cbd5e1' : '#0f172a' }]} numberOfLines={1}>{item.label}</Text>
                        {Number.isFinite(item.ratio) && (
                            <View style={styles.analyticsListBar}>
                                <View style={[styles.analyticsListBarFill, { width: `${Math.min(100, Math.round(item.ratio * 100))}%` }]} />
                            </View>
                        )}
                    </View>
                    <Text style={[styles.analyticsListValue, { color: isDark ? '#fff' : '#0f172a' }]}>{item.value}</Text>
                </View>
            ))
        ) : (
            <Text style={[styles.analyticsListEmpty, { color: isDark ? '#94a3b8' : '#64748b' }]}>{emptyLabel}</Text>
        )}
    </TouchableOpacity>
);

const MiniBars = ({ data = [], isDark, height = 34, barWidth = 8 }) => {
    const max = Math.max(...data, 1);
    return (
        <View style={styles.analyticsMiniBars}>
            {data.map((value, idx) => {
                const barHeight = 4 + Math.round((value / max) * (height - 6));
                return (
                    <View key={`bar-${idx}`} style={[styles.analyticsMiniBarTrack, { height, width: barWidth + 2 }]}>
                        <View
                            style={[
                                styles.analyticsMiniBar,
                                { height: barHeight, backgroundColor: isDark ? '#3b82f6' : '#2563eb', width: barWidth },
                            ]}
                        />
                    </View>
                );
            })}
        </View>
    );
};

const DualMiniBars = ({ seriesA = [], seriesB = [], isDark }) => {
    const max = Math.max(...seriesA, ...seriesB, 1);
    return (
        <View style={styles.analyticsDualBars}>
            {seriesA.map((value, idx) => {
                const secondary = seriesB[idx] || 0;
                const heightA = 4 + Math.round((value / max) * 28);
                const heightB = 4 + Math.round((secondary / max) * 28);
                return (
                    <View key={`dual-${idx}`} style={styles.analyticsDualBarTrack}>
                        <View style={[styles.analyticsDualBarPrimary, { height: heightA, backgroundColor: isDark ? '#3b82f6' : '#2563eb' }]} />
                        <View style={[styles.analyticsDualBarSecondary, { height: heightB, backgroundColor: isDark ? '#22c55e' : '#16a34a' }]} />
                    </View>
                );
            })}
        </View>
    );
};

const StatusStrip = ({ segments = [], isDark }) => {
    const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
    return (
        <View>
            <View style={styles.analyticsStatusStrip}>
                {segments.map((seg) => (
                    <View
                        key={seg.label}
                        style={[
                            styles.analyticsStatusSegment,
                            { flex: Math.max(seg.value, 1), backgroundColor: seg.color },
                        ]}
                    />
                ))}
            </View>
            <View style={styles.analyticsStatusLegend}>
                {segments.map((seg) => (
                    <View key={`${seg.label}-legend`} style={styles.analyticsStatusLegendItem}>
                        <View style={[styles.analyticsStatusDot, { backgroundColor: seg.color }]} />
                        <Text style={[styles.analyticsStatusLegendText, { color: isDark ? '#cbd5e1' : '#0f172a' }]}>{seg.label}</Text>
                        <Text style={[styles.analyticsStatusLegendValue, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                            {Math.round((seg.value / total) * 100)}%
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

const FunnelBars = ({ steps = [], isDark }) => {
    const max = Math.max(...steps.map(step => step.count), 1);
    return (
        <View style={styles.analyticsFunnelRow}>
            {steps.map(step => {
                const height = 10 + Math.round((step.count / max) * 50);
                return (
                    <View key={step.label} style={styles.analyticsFunnelItem}>
                        <View style={[styles.analyticsFunnelBar, { height, backgroundColor: isDark ? '#3b82f6' : '#2563eb' }]} />
                        <Text style={[styles.analyticsFunnelLabel, { color: isDark ? '#cbd5e1' : '#0f172a' }]} numberOfLines={1}>{step.label}</Text>
                        <Text style={[styles.analyticsFunnelValue, { color: isDark ? '#94a3b8' : '#64748b' }]}>{step.count}</Text>
                    </View>
                );
            })}
        </View>
    );
};

const LabeledBarChart = ({ title, series, labels, formatter, isDark, color = '#3b82f6', subtitle }) => {
    const max = Math.max(...series, 1);
    return (
        <View style={[styles.analyticsChartCard, !isDark && styles.cardLight]}>
            <View style={styles.analyticsChartHeader}>
                <Text style={[styles.analyticsChartTitle, !isDark && styles.textDark]}>{title}</Text>
                {subtitle ? <Text style={[styles.analyticsChartSubtitle, !isDark && styles.textSecondary]}>{subtitle}</Text> : null}
            </View>
            <View style={styles.analyticsChartBars}>
                {series.map((value, idx) => {
                    const height = 8 + Math.round((value / max) * 70);
                    return (
                        <View key={`chart-${idx}`} style={styles.analyticsChartColumn}>
                            <Text style={[styles.analyticsChartValue, !isDark && styles.textDark]} numberOfLines={1}>
                                {formatter(value)}
                            </Text>
                            <View style={styles.analyticsChartTrack}>
                                <View style={[styles.analyticsChartFill, { height, backgroundColor: color }]} />
                            </View>
                            <Text style={[styles.analyticsChartLabel, !isDark && styles.textSecondary]} numberOfLines={1}>
                                {labels[idx]}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};



// Urgency filter options
const URGENCY_OPTIONS = [
    { id: 'all', label: 'filterAllUrgency' },
    { id: 'emergency', label: 'urgencyEmergency' },
    { id: 'urgent', label: 'urgencyUrgent' },
    { id: 'planned', label: 'urgencyPlanned' },
];

// Status filter options (dispatcher queue parity)
const STATUS_OPTIONS = [
    { id: 'Active', label: 'statusActive' },
    { id: 'Payment', label: 'statusPayment' },
    { id: 'Confirmed', label: 'filterStatusConfirmed' },
    { id: 'Canceled', label: 'statusCanceled' },
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
    area: '', fullAddress: '', orientir: '', preferredDate: '', preferredTime: '', dispatcherNote: '',
};
// ----------------------------------------


export default function AdminDashboard({ navigation }) {
    const { showToast } = useToast();
    const { translations, language, cycleLanguage, t } = useLocalization();
    const TRANSLATIONS = translations[language] || translations['en'] || {};
    const { logout } = useAuth();

    // UI State
    const [activeTab, setActiveTab] = useState('analytics');
    const [isDark, setIsDark] = useState(true);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({});
    const [commissionStats, setCommissionStats] = useState({});
    const [analyticsRange, setAnalyticsRange] = useState('30d');
    const [analyticsGranularity, setAnalyticsGranularity] = useState('day');
    const [analyticsSection, setAnalyticsSection] = useState('overview');
    const [analyticsFilters, setAnalyticsFilters] = useState({ urgency: 'all', service: 'all', area: 'all' });
    const [analyticsCustomRange, setAnalyticsCustomRange] = useState({ start: null, end: null });
    const [showAnalyticsStartPicker, setShowAnalyticsStartPicker] = useState(false);
    const [showAnalyticsEndPicker, setShowAnalyticsEndPicker] = useState(false);
    const [analyticsDetail, setAnalyticsDetail] = useState({ type: null });
    const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState(null);

    // Data State
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [dispatchers, setDispatchers] = useState([]);
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

    // Needs Attention Section State
    const [showNeedsAttention, setShowNeedsAttention] = useState(true);
    const [filterAttentionType, setFilterAttentionType] = useState('All');
    const [sortOrder, setSortOrder] = useState('newest');

    const [pickerModal, setPickerModal] = useState({ visible: false, options: [], value: '', onChange: null, title: '' });
    const [serviceTypes, setServiceTypes] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [managedDistricts, setManagedDistricts] = useState([]);
    const [serviceTypeModal, setServiceTypeModal] = useState({ visible: false, type: null });
    const [tempServiceType, setTempServiceType] = useState({});
    const [districtModal, setDistrictModal] = useState({ visible: false, district: null });
    const [tempDistrict, setTempDistrict] = useState({ code: '', name_en: '', name_ru: '', name_kg: '', region: '', sort_order: '', is_active: true });
    const [districtSearch, setDistrictSearch] = useState('');
    const [serviceTypesCollapsed, setServiceTypesCollapsed] = useState(false);
    const [districtsCollapsed, setDistrictsCollapsed] = useState(false);

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
        const byDispatchers = (dispatchers || []).map(d => ({
            id: String(d.id),
            label: d.full_name || d.name || d.phone || `Dispatcher ${d.id}`,
        }));
        const byOrders = orders
            .filter(o => o.dispatcher_id || o.dispatcher?.id)
            .map(o => ({
                id: String(o.dispatcher_id || o.dispatcher?.id),
                label: o.dispatcher?.full_name || `Dispatcher ${o.dispatcher_id || o.dispatcher?.id}`,
            }));
        const merged = new Map();
        [...byDispatchers, ...byOrders].forEach(opt => {
            if (opt?.id && !merged.has(opt.id)) merged.set(opt.id, opt);
        });
        return baseOptions.concat(Array.from(merged.values()));
    }, [dispatchers, orders, language]);

    const serviceFilterOptions = useMemo(() => ([
        { id: 'all', label: TRANSLATIONS.labelAllServices || TRANSLATIONS.statusAll || 'All Services' },
        ...serviceTypes.map(st => ({
            id: st.code || st.id,
            label: st[`name_${language}`] || st.name_en || st.name_ru || st.name_kg || st.code || st.id,
        })),
    ]), [serviceTypes, language]);

    const analyticsAreaOptions = useMemo(() => {
        const areas = Array.from(new Set(orders.map(o => o.area).filter(Boolean))).sort();
        return [
            { id: 'all', label: TRANSLATIONS.filterAll || 'All' },
            ...areas.map(area => ({ id: area, label: area })),
        ];
    }, [orders, language]);

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

    const analyticsOrders = useMemo(() => {
        return orders.filter(order => {
            if (!order) return false;
            if (analyticsFilters.urgency !== 'all' && order.urgency !== analyticsFilters.urgency) return false;
            if (analyticsFilters.service !== 'all' && order.service_type !== analyticsFilters.service) return false;
            if (analyticsFilters.area !== 'all' && order.area !== analyticsFilters.area) return false;
            if (!analyticsRangeWindow) return true;
            const stamp = order.completed_at || order.confirmed_at || order.updated_at || order.created_at;
            if (!stamp) return true;
            const ts = new Date(stamp);
            if (Number.isNaN(ts.getTime())) return true;
            return ts >= analyticsRangeWindow.start && ts <= analyticsRangeWindow.end;
        });
    }, [orders, analyticsFilters, analyticsRangeWindow]);

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

        const totalBalances = masters.reduce((sum, m) => sum + (m.prepaid_balance || 0), 0);
        const lowBalanceCount = masters.filter(m => (m.prepaid_balance || 0) < 500).length;

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
            commissionCollected: Number(commissionStats.totalCollected || 0),
            commissionOutstanding: Number(commissionStats.totalOutstanding || 0),
            totalBalances,
            lowBalanceCount,
            statusBreakdown,
        };
    }, [analyticsOrders, commissionStats, masters]);

    const analyticsLists = useMemo(() => {
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

        const topAreas = buildTopList(Object.entries(areaCounts).map(([label, count]) => ({ label, count })));
        const topServices = buildTopList(Object.entries(serviceCounts).map(([label, count]) => ({
            label: getServiceLabel(label, t),
            count,
        })));
        const urgencyItems = [
            { label: TRANSLATIONS.urgencyEmergency || 'Emergency', count: urgencyCounts.emergency },
            { label: TRANSLATIONS.urgencyUrgent || 'Urgent', count: urgencyCounts.urgent },
            { label: TRANSLATIONS.urgencyPlanned || 'Planned', count: urgencyCounts.planned },
        ];
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
            const code = order.cancel_reason_code || order.cancel_reason || order.cancellation_reason || 'Unknown';
            const label = code || (TRANSLATIONS.analyticsUnknown || 'Unknown');
            cancelCounts[label] = (cancelCounts[label] || 0) + 1;
        });
        const cancelReasons = buildTopList(Object.entries(cancelCounts).map(([label, count]) => ({ label, count })));

        const backlogOrders = analyticsOrders
            .filter(order => !COMPLETED_STATUSES.has(normalizeStatus(order.status)) && !CANCELED_STATUSES.has(normalizeStatus(order.status)))
            .map(order => {
                const age = hoursSince(order.created_at);
                return {
                    label: `${getServiceLabel(order.service_type, t)} • ${order.area || '-'}`,
                    value: age ? `${age.toFixed(1)}h` : '—',
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
    }, [analyticsOrders, t, TRANSLATIONS]);

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
                if (COMPLETED_STATUSES.has(normalizeStatus(order.status))) {
                    completedSeries[idx] += 1;
                    const price = Number(order.final_price ?? order.initial_price ?? 0);
                    if (Number.isFinite(price)) {
                        revenueSeries[idx] += price;
                        commissionSeries[idx] += price * commissionRate;
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
                        commissionSeries[idx] += price * commissionRate;
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
        const byCompleted = [...list].sort((a, b) => b.completed - a.completed);
        const byRevenue = [...list].sort((a, b) => b.revenue - a.revenue);

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
    }, [analyticsOrders, TRANSLATIONS]);

    useEffect(() => {
        if (activeTab !== 'analytics') return;
        setAnalyticsUpdatedAt(new Date());
    }, [analyticsOrders.length, analyticsRange, analyticsFilters, analyticsGranularity, activeTab]);

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
        if (filterDispatcher === 'unassigned') {
            res = res.filter(o => !(o.dispatcher_id || o.assigned_dispatcher_id));
        } else if (filterDispatcher !== 'all') {
            res = res.filter(o => String(o.dispatcher_id || o.assigned_dispatcher_id) === String(filterDispatcher));
        }

        // Urgency
        if (filterUrgency !== 'all') res = res.filter(o => o.urgency === filterUrgency);

        // Service
        if (serviceFilter !== 'all') res = res.filter(o => o.service_type === serviceFilter);

        // Sort
        res.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        return res;
    }, [orders, searchQuery, statusFilter, filterUrgency, serviceFilter, filterSort, filterDispatcher]);

    // Reset pagination when filters change
    useEffect(() => {
        setQueuePage(1);
    }, [searchQuery, statusFilter, filterUrgency, serviceFilter, filterSort, filterDispatcher, viewMode]);

    useEffect(() => {
        if (serviceTypeModal.visible) {
            setTempServiceType(serviceTypeModal.type ? { ...serviceTypeModal.type } : { is_active: true, sort_order: 99 });
        }
    }, [serviceTypeModal]);

    useEffect(() => {
        if (districtModal.visible) {
            setTempDistrict(districtModal.district ? { ...districtModal.district } : { code: '', name_en: '', name_ru: '', name_kg: '', region: '', sort_order: 99, is_active: true });
        }
    }, [districtModal]);

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
    const [assignOrderId, setAssignOrderId] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentOrder, setPaymentOrder] = useState(null);
    const [paymentData, setPaymentData] = useState({ method: 'cash', proofUrl: '' });
    const [showMasterDetails, setShowMasterDetails] = useState(false);
    const [masterDetails, setMasterDetails] = useState(null);
    const [masterDetailsLoading, setMasterDetailsLoading] = useState(false);
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

    useEffect(() => {
        loadServiceTypes();
        loadDistricts();
    }, [language]);

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
            || showPaymentModal
            || showMasterDetails
            || serviceTypeModal.visible
            || districtModal.visible;
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
        showPaymentModal,
        showMasterDetails,
        serviceTypeModal.visible,
        districtModal.visible,
        isSidebarOpen
    ]);

    useEffect(() => {
        if (!detailsOrder) {
            setIsEditing(false);
        }
    }, [detailsOrder]);

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
            loadDistricts(),
            loadManagedDistricts(),
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
        } catch (e) {
            console.error('Commission error', e);
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
                    label: d[labelField] || d.name_en,
                    region: d.region
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAllData(true); // Skip loading screen for smooth refresh
        setRefreshing(false);
    }, [dashboardFilter]);

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
            setAvailableMasters(mastersData || []);
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

    const openOrderDetails = (order) => {
        setIsEditing(false);
        setEditForm({});
        setDetailsOrder(order);
    };

    const handleSaveServiceType = async (typeData) => {
        setActionLoading(true);
        try {
            const { icon, ...payload } = typeData || {};
            if (payload.id) {
                await ordersService.updateServiceType(payload.id, payload);
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
            } else {
                await ordersService.addServiceType(payload);
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
            }
            setServiceTypeModal({ visible: false, type: null });
            loadServiceTypes();
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
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
                    } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
                }
            }
        ]);
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
                region: districtData.region || null,
                sort_order: districtData.sort_order ? parseInt(districtData.sort_order, 10) : 99,
                is_active: districtData.is_active !== false,
            };
            if (districtData.id) {
                await ordersService.updateDistrict(districtData.id, payload);
            } else {
                await ordersService.addDistrict(payload);
            }
            setDistrictModal({ visible: false, district: null });
            loadManagedDistricts();
            loadDistricts();
            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
        } catch (e) {
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteDistrict = async (id) => {
        Alert.alert(TRANSLATIONS.deleteDistrict || 'Delete District', TRANSLATIONS.confirmDeleteDistrict || 'Are you sure?', [
            { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
            {
                text: TRANSLATIONS.delete || 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await ordersService.deleteDistrict(id);
                        loadManagedDistricts();
                        loadDistricts();
                    } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
                }
            }
        ]);
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
                loadOrders(); // Refresh list
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

            const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setIsEditing(false);
                loadOrders();
                setDetailsOrder(prev => ({
                    ...prev,
                    ...editForm,
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
                loadMasters();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleToggleDispatcher = async (dispatcherId, isActive) => {
        setActionLoading(true);
        try {
            const res = await authService.toggleDispatcherActive(dispatcherId, !isActive);
            if (res.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                loadDispatchers();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
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
                            showToast(TRANSLATIONS.filterStatusReopened || TRANSLATIONS.toastUpdated || 'Updated', 'success');
                            setDetailsOrder(null);
                            loadOrders();
                        } else {
                            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
                        }
                    } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
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
                            showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                            loadOrders();
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
                    loadOrders();
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

    const handleConfirmPaymentAdmin = async (orderId, paymentMethod = 'cash') => {
        if (!orderId) return;
        Alert.alert(TRANSLATIONS.confirmPayment || 'Confirm Payment', TRANSLATIONS.confirmPaymentPrompt || 'Mark this order as paid?', [
            { text: TRANSLATIONS.cancel || 'Cancel', style: 'cancel' },
            {
                text: TRANSLATIONS.confirm || 'Confirm',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        if (ordersService.confirmPaymentAdmin) {
                            await ordersService.confirmPaymentAdmin(orderId, paymentMethod);
                        } else {
                            await ordersService.updateOrder(orderId, {
                                status: ORDER_STATUS.CONFIRMED,
                                confirmed_at: new Date().toISOString(),
                                payment_method: paymentMethod,
                                payment_proof_url: null
                            });
                        }
                        showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                        setDetailsOrder(null);
                        loadOrders();
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
        setActionLoading(true);
        try {
            const result = await ordersService.confirmPaymentAdmin(paymentOrder.id, paymentData.method, paymentData.proofUrl || null);
            if (result.success) {
                showToast(TRANSLATIONS.toastPaymentConfirmed || 'Payment confirmed', 'success');
                setShowPaymentModal(false);
                setPaymentOrder(null);
                setPaymentData({ method: 'cash', proofUrl: '' });
                loadOrders();
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

    const openMasterDetails = async (master) => {
        if (!master?.id) {
            showToast?.(TRANSLATIONS.errorMasterDetailsUnavailable || 'Master details unavailable', 'error');
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

    const handleCancelOrderAdmin = async (orderId) => {
        if (!orderId) return;
        const confirmCancel = async () => {
            setActionLoading(true);
            try {
                const result = await ordersService.cancelOrderAdmin(orderId, 'admin_cancel');
                if (result.success) {
                    showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                    setDetailsOrder(null);
                    loadOrders();
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
                    loadOrders();
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

    const handleVerifyPaymentProof = async (orderId, isValid) => {
        setActionLoading(true);
        try {
            const result = await ordersService.verifyPaymentProof(orderId, isValid, isValid ? 'Approved by admin' : 'Rejected by admin');
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setDetailsOrder(null);
                loadOrders();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
        finally { setActionLoading(false); }
    };

    const handleAddMasterBalance = async (masterId, amount, type, notes) => {
        setActionLoading(true);
        try {
            const result = await earningsService.addMasterBalance(masterId, parseFloat(amount), type, notes);
            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setShowBalanceModal(false);
                setBalanceData({ amount: '', type: 'top_up', notes: '' });
                loadMasters();
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
                loadMasters();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) { showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error'); }
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
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setIsEditingPerson(false);
                setDetailsPerson(null);
                if (detailsPerson?.type === 'master') loadMasters();
                else loadDispatchers();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
            }
        } catch (e) {
            console.error('Profile update failed:', e);
            showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
        }
        finally { setActionLoading(false); }
    };

    // Handle create new user (master/dispatcher)
    const handleCreateUser = async () => {
        if (!newUserData.email || !newUserData.password || !newUserData.full_name) {
            showToast(TRANSLATIONS.toastFillRequired || 'Please fill required fields', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await authService.createUser({
                ...newUserData,
                role: addUserRole
            });

            if (result.success) {
                showToast(TRANSLATIONS.toastUpdated || 'Updated', 'success');
                setShowAddUserModal(false);
                setNewUserData({ email: '', password: '', full_name: '', phone: '', service_area: '', experience_years: '' });
                if (addUserRole === 'master') loadMasters();
                else loadDispatchers();
            } else {
                showToast((TRANSLATIONS.toastFailedPrefix || 'Failed: ') + (TRANSLATIONS.errorGeneric || 'Error'), 'error');
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

    const openOrderHistory = async (person) => {
        if (!person?.id) return;
        setSelectedMaster(person);
        setMasterOrderHistory([]);
        setShowOrderHistoryModal(true);
        await loadOrderHistory(person);
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
        { key: 'analytics', label: TRANSLATIONS.analytics || 'Analytics', icon: 'analytics' },
        { key: 'orders', label: TRANSLATIONS.orders || 'Orders', icon: 'list' },
        { key: 'people', label: TRANSLATIONS.people || 'People', icon: 'people' },
        { key: 'settings', label: TRANSLATIONS.settings || 'Settings', icon: 'settings' },
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
                        {/* Create Order */}
                        <TouchableOpacity
                            style={[styles.sidebarNavItem, activeTab === 'create_order' && styles.sidebarNavItemActive]}
                            onPress={() => { setActiveTab('create_order'); setIsSidebarOpen(false); }}
                        >
                            <Text style={[styles.sidebarNavText, activeTab === 'create_order' && styles.sidebarNavTextActive]}>
                                + {TRANSLATIONS.createOrder || 'Create Order'}
                            </Text>
                        </TouchableOpacity>

                        {/* Main Navigation */}
                        {MENU_ITEMS.map(item => {
                            const isActive = activeTab === item.key;
                            const label = item.key === 'orders'
                                ? (TRANSLATIONS.ordersQueue || TRANSLATIONS.orders || 'Orders')
                                : item.label;
                            return (
                                <TouchableOpacity
                                    key={item.key}
                                    style={[styles.sidebarNavItem, isActive && styles.sidebarNavItemActive]}
                                    onPress={() => { setActiveTab(item.key); setIsSidebarOpen(false); }}
                                >
                                    <View style={styles.sidebarNavRow}>
                                        <Text style={[styles.sidebarNavText, isActive && styles.sidebarNavTextActive]}>
                                            {label}
                                        </Text>
                                        {item.key === 'orders' && needsActionOrders.length > 0 && (
                                            <View style={styles.sidebarBadge}>
                                                <Text style={styles.sidebarBadgeText}>{needsActionOrders.length}</Text>
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
                                <Text style={[styles.sidebarThemeIcon, !isDark && styles.textDark]}>{isDark ? '☀' : '☾'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sidebarLangBtn, !isDark && styles.sidebarBtnLight]}
                                onPress={cycleLanguage}>
                                <Text style={[styles.sidebarLangText, !isDark && styles.textDark, { fontSize: 24 }]}
                                >
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
                    <Text style={[styles.menuBtnText, !isDark && styles.textDark]}>☰</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, !isDark && styles.textDark]}>{title}</Text>
            </View>
            <View style={styles.headerRight}>
                <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, !isDark && styles.btnLight]}>
                    <Text style={[styles.iconText, !isDark && styles.textDark]}>↻</Text>
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



    const renderAnalytics = () => {
        const columns = getAnalyticsColumns();
        const cardWidth = columns === 1 ? '100%' : columns === 2 ? '48%' : '31%';
        const listWidth = columns === 1 ? '100%' : '48%';
        const showClearFilters = analyticsFilters.urgency !== 'all' || analyticsFilters.service !== 'all' || analyticsFilters.area !== 'all';
        const analyticsLocale = language === 'ru' ? 'ru-RU' : language === 'kg' ? 'ky-KG' : 'en-US';

        const rangeOptions = [
            { key: 'today', label: TRANSLATIONS.filterToday || 'Today' },
            { key: '7d', label: '7D' },
            { key: '30d', label: '30D' },
            { key: '90d', label: '90D' },
            { key: 'all', label: TRANSLATIONS.filterAll || 'All' },
            { key: 'custom', label: TRANSLATIONS.filterCustom || 'Custom' },
        ];

        const granularityOptions = [
            { key: 'hour', label: TRANSLATIONS.analyticsGranularityHour || 'Hours' },
            { key: 'day', label: TRANSLATIONS.analyticsGranularityDay || 'Days' },
            { key: 'week', label: TRANSLATIONS.analyticsGranularityWeek || 'Weeks' },
            { key: 'month', label: TRANSLATIONS.analyticsGranularityMonth || 'Months' },
            { key: 'quarter', label: TRANSLATIONS.analyticsGranularityQuarter || 'Quarters' },
            { key: 'year', label: TRANSLATIONS.analyticsGranularityYear || 'Years' },
        ];

        const granularityLabel = granularityOptions.find(opt => opt.key === analyticsGranularity)?.label || analyticsGranularity;
        const chartSubtitle = `${TRANSLATIONS.analyticsViewBy || 'View by'} ${granularityLabel}`;

        const urgencyOptions = URGENCY_OPTIONS.map(opt => ({
            id: opt.id,
            label: TRANSLATIONS[opt.label] || opt.label,
        }));

        const currentUrgencyLabel = urgencyOptions.find(o => o.id === analyticsFilters.urgency)?.label || analyticsFilters.urgency;
        const currentServiceLabel = serviceFilterOptions.find(o => o.id === analyticsFilters.service)?.label || analyticsFilters.service;
        const currentAreaLabel = analyticsAreaOptions.find(o => o.id === analyticsFilters.area)?.label || analyticsFilters.area;

        const detailTitleMap = {
            topAreas: TRANSLATIONS.analyticsTopAreas || 'Top Areas',
            topServices: TRANSLATIONS.analyticsTopServices || 'Top Services',
            urgencyMix: TRANSLATIONS.analyticsUrgencyMix || 'Urgency Mix',
            cancelReasons: TRANSLATIONS.analyticsCancelReasons || 'Cancellation Reasons',
            backlog: TRANSLATIONS.analyticsBacklog || 'Backlog Orders',
            funnel: TRANSLATIONS.analyticsOrderFunnel || 'Order Funnel',
            topPerformersCompleted: TRANSLATIONS.analyticsTopByCompleted || 'Top by Completed Jobs',
            topPerformersRevenue: TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue',
        };

        const detailItemsMap = {
            topAreas: analyticsLists.topAreas,
            topServices: analyticsLists.topServices,
            urgencyMix: analyticsLists.urgencyMix,
            cancelReasons: analyticsLists.cancelReasons,
            backlog: analyticsLists.backlogOrders,
            funnel: analyticsLists.funnel,
            topPerformersCompleted: analyticsPeople.topByCompleted,
            topPerformersRevenue: analyticsPeople.topByRevenue,
        };

        const handleCustomDateChange = (field, event, selectedDate) => {
            if (Platform.OS !== 'ios') {
                setShowAnalyticsStartPicker(false);
                setShowAnalyticsEndPicker(false);
            }
            if (!selectedDate) return;
            setAnalyticsCustomRange(prev => {
                const next = { ...prev, [field]: selectedDate };
                if (next.start && next.end && next.start > next.end) {
                    if (field === 'start') next.end = selectedDate;
                    else next.start = selectedDate;
                }
                return next;
            });
        };

        const formatCustomDate = (date) => (
            date ? date.toLocaleDateString(analyticsLocale) : (TRANSLATIONS.selectDate || 'Select date')
        );

        return (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderHeader(TRANSLATIONS.analyticsTitle || 'Analytics')}

                <View style={[styles.analyticsFilterCard, !isDark && styles.cardLight]}>
                    <View style={styles.analyticsFilterHeader}>
                        <Text style={[styles.analyticsSectionLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS.analyticsTimeRange || 'Time Range'}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsRangeRow}>
                            {rangeOptions.map((opt) => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[
                                        styles.analyticsRangeChip,
                                        analyticsRange === opt.key && styles.analyticsRangeChipActive,
                                        !isDark && analyticsRange !== opt.key && styles.btnLight,
                                    ]}
                                    onPress={() => setAnalyticsRange(opt.key)}
                                >
                                    <Text style={[styles.analyticsRangeText, analyticsRange === opt.key && styles.analyticsRangeTextActive]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <View style={styles.analyticsFilterRow}>
                        <TouchableOpacity
                            style={[
                                styles.analyticsFilterPill,
                                analyticsFilters.urgency !== 'all' && styles.analyticsFilterPillActive,
                                !isDark && styles.analyticsFilterPillLight,
                            ]}
                            onPress={() => setPickerModal({
                                visible: true,
                                title: TRANSLATIONS.filterUrgency || 'Urgency',
                                options: [{ id: 'all', label: TRANSLATIONS.filterAll || 'All' }, ...urgencyOptions],
                                value: analyticsFilters.urgency,
                                onChange: (v) => setAnalyticsFilters(prev => ({ ...prev, urgency: v })),
                            })}
                        >
                            <View style={styles.analyticsFilterPillRow}>
                                <Ionicons name="flash-outline" size={14} color={isDark ? '#cbd5e1' : '#0f172a'} />
                                <Text style={[styles.analyticsFilterPillText, !isDark && styles.textDark]}>{currentUrgencyLabel}</Text>
                            </View>
                            <Ionicons name="chevron-down" size={14} color={isDark ? '#64748b' : '#475569'} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.analyticsFilterPill,
                                analyticsFilters.service !== 'all' && styles.analyticsFilterPillActive,
                                !isDark && styles.analyticsFilterPillLight,
                            ]}
                            onPress={() => setPickerModal({
                                visible: true,
                                title: TRANSLATIONS.filterService || 'Service',
                                options: serviceFilterOptions,
                                value: analyticsFilters.service,
                                onChange: (v) => setAnalyticsFilters(prev => ({ ...prev, service: v })),
                            })}
                        >
                            <View style={styles.analyticsFilterPillRow}>
                                <Ionicons name="briefcase-outline" size={14} color={isDark ? '#cbd5e1' : '#0f172a'} />
                                <Text style={[styles.analyticsFilterPillText, !isDark && styles.textDark]}>{currentServiceLabel}</Text>
                            </View>
                            <Ionicons name="chevron-down" size={14} color={isDark ? '#64748b' : '#475569'} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.analyticsFilterPill,
                                analyticsFilters.area !== 'all' && styles.analyticsFilterPillActive,
                                !isDark && styles.analyticsFilterPillLight,
                            ]}
                            onPress={() => setPickerModal({
                                visible: true,
                                title: TRANSLATIONS.filterArea || 'Area',
                                options: analyticsAreaOptions,
                                value: analyticsFilters.area,
                                onChange: (v) => setAnalyticsFilters(prev => ({ ...prev, area: v })),
                            })}
                        >
                            <View style={styles.analyticsFilterPillRow}>
                                <Ionicons name="location-outline" size={14} color={isDark ? '#cbd5e1' : '#0f172a'} />
                                <Text style={[styles.analyticsFilterPillText, !isDark && styles.textDark]}>{currentAreaLabel}</Text>
                            </View>
                            <Ionicons name="chevron-down" size={14} color={isDark ? '#64748b' : '#475569'} />
                        </TouchableOpacity>

                        {showClearFilters && (
                            <TouchableOpacity style={styles.analyticsClearBtn} onPress={() => setAnalyticsFilters({ urgency: 'all', service: 'all', area: 'all' })}>
                                <Text style={styles.analyticsClearBtnText}>{TRANSLATIONS.clear || 'Clear'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {analyticsRange === 'custom' && (
                        <View style={styles.analyticsCustomRow}>
                            <TouchableOpacity
                                style={[styles.analyticsCustomButton, !isDark && styles.analyticsCustomButtonLight]}
                                onPress={() => setShowAnalyticsStartPicker(true)}
                            >
                                <Text style={styles.analyticsCustomLabel}>{TRANSLATIONS.startDate || 'Start'}</Text>
                                <Text style={[styles.analyticsCustomValue, !isDark && styles.textDark]}>{formatCustomDate(analyticsCustomRange.start)}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.analyticsCustomSeparator, !isDark && styles.textDark]}>→</Text>
                            <TouchableOpacity
                                style={[styles.analyticsCustomButton, !isDark && styles.analyticsCustomButtonLight]}
                                onPress={() => setShowAnalyticsEndPicker(true)}
                            >
                                <Text style={styles.analyticsCustomLabel}>{TRANSLATIONS.endDate || 'End'}</Text>
                                <Text style={[styles.analyticsCustomValue, !isDark && styles.textDark]}>{formatCustomDate(analyticsCustomRange.end)}</Text>
                            </TouchableOpacity>

                            {showAnalyticsStartPicker && (
                                <DateTimePicker
                                    value={analyticsCustomRange.start || new Date()}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(e, d) => handleCustomDateChange('start', e, d)}
                                    maximumDate={new Date()}
                                />
                            )}

                            {showAnalyticsEndPicker && (
                                <DateTimePicker
                                    value={analyticsCustomRange.end || new Date()}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(e, d) => handleCustomDateChange('end', e, d)}
                                    maximumDate={new Date()}
                                    minimumDate={analyticsCustomRange.start || undefined}
                                />
                            )}
                        </View>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsSectionTabs}>
                    {[
                        { key: 'overview', label: TRANSLATIONS.analyticsOverview || 'Overview' },
                        { key: 'operations', label: TRANSLATIONS.analyticsOperations || 'Operations' },
                        { key: 'financial', label: TRANSLATIONS.analyticsFinancial || 'Financial' },
                        { key: 'quality', label: TRANSLATIONS.analyticsQuality || 'Quality' },
                        { key: 'people', label: TRANSLATIONS.analyticsPeople || 'People' },
                    ].map(section => {
                        const isActive = analyticsSection === section.key;
                        return (
                            <TouchableOpacity
                                key={section.key}
                                style={[styles.analyticsSectionTab, isActive && styles.analyticsSectionTabActive]}
                                onPress={() => setAnalyticsSection(section.key)}
                            >
                                <Text style={[styles.analyticsSectionTabText, isActive && styles.analyticsSectionTabTextActive]}>
                                    {section.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {(analyticsSection === 'overview' || analyticsSection === 'financial') && (
                    <View style={styles.analyticsGranularityRow}>
                        <Text style={[styles.analyticsGranularityLabel, !isDark && styles.textSecondary]}>
                            {TRANSLATIONS.analyticsViewBy || 'View by'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsGranularityChips}>
                            {granularityOptions.map(opt => {
                                const isActive = analyticsGranularity === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        style={[styles.analyticsGranularityChip, isActive && styles.analyticsGranularityChipActive]}
                                        onPress={() => setAnalyticsGranularity(opt.key)}
                                    >
                                        <Text style={[styles.analyticsGranularityText, isActive && styles.analyticsGranularityTextActive]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {analyticsSection === 'overview' && (
                    <View style={styles.analyticsChartGrid}>
                        <View style={{ width: listWidth }}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsDailyOrders || 'Daily Orders'}
                                subtitle={chartSubtitle}
                                series={analyticsChartSeries.ordersSeries}
                                labels={analyticsChartSeries.labels}
                                formatter={formatNumber}
                                isDark={isDark}
                                color="#3b82f6"
                            />
                        </View>
                        <View style={{ width: listWidth }}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsDailyGMV || 'Daily GMV'}
                                subtitle={chartSubtitle}
                                series={analyticsChartSeries.revenueSeries}
                                labels={analyticsChartSeries.labels}
                                formatter={formatMoney}
                                isDark={isDark}
                                color="#22c55e"
                            />
                        </View>
                    </View>
                )}

                {analyticsSection === 'financial' && (
                    <View style={styles.analyticsChartGrid}>
                        <View style={{ width: listWidth }}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsDailyGMV || 'Daily GMV'}
                                subtitle={chartSubtitle}
                                series={analyticsChartSeries.revenueSeries}
                                labels={analyticsChartSeries.labels}
                                formatter={formatMoney}
                                isDark={isDark}
                                color="#22c55e"
                            />
                        </View>
                        <View style={{ width: listWidth }}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsDailyCommission || 'Daily Commission'}
                                subtitle={chartSubtitle}
                                series={analyticsChartSeries.commissionSeries}
                                labels={analyticsChartSeries.labels}
                                formatter={formatMoney}
                                isDark={isDark}
                                color="#f59e0b"
                            />
                        </View>
                    </View>
                )}

                <View style={styles.analyticsVisualGrid}>
                    <View style={{ width: listWidth }}>
                        <View style={[styles.analyticsVisualCard, !isDark && styles.cardLight]}>
                            <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                {TRANSLATIONS.analyticsStatusMix || 'Status Mix'}
                            </Text>
                            <StatusStrip
                                segments={[
                                    { label: TRANSLATIONS.analyticsOpenOrders || 'Open', value: analyticsStats.statusBreakdown.open, color: '#38bdf8' },
                                    { label: TRANSLATIONS.analyticsActiveJobs || 'Active', value: analyticsStats.statusBreakdown.active, color: '#3b82f6' },
                                    { label: TRANSLATIONS.analyticsCompleted || 'Completed', value: analyticsStats.statusBreakdown.completed, color: '#22c55e' },
                                    { label: TRANSLATIONS.analyticsCanceled || 'Canceled', value: analyticsStats.statusBreakdown.canceled, color: '#ef4444' },
                                ]}
                                isDark={isDark}
                            />
                        </View>
                    </View>
                    <View style={{ width: listWidth }}>
                        <View style={[styles.analyticsVisualCard, !isDark && styles.cardLight]}>
                            <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                {TRANSLATIONS.analyticsOrderFunnel || 'Order Funnel'}
                            </Text>
                            <FunnelBars
                                steps={(analyticsLists.funnel || []).map(step => ({ label: step.label, count: step.count || 0 }))}
                                isDark={isDark}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.analyticsMetricGrid}>
                    {analyticsSection === 'overview' && (
                        <>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsTotalOrders || 'Total Orders'}
                                    value={formatNumber(analyticsStats.totalOrders)}
                                    subLabel={`${formatPercent(analyticsStats.completionRate)} ${TRANSLATIONS.analyticsCompletionRate || 'completion rate'}`}
                                    sparkData={analyticsDailySeries.ordersSeries}
                                    onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.totalOrders || TRANSLATIONS.analyticsTotalOrders || 'Total Orders')}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsCompleted || 'Completed'}
                                    value={formatNumber(analyticsStats.completedOrders)}
                                    subLabel={`${formatPercent(analyticsStats.cancelRate)} ${TRANSLATIONS.analyticsCancelRate || 'cancel rate'}`}
                                    sparkData={analyticsDailySeries.completedSeries}
                                    onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.analyticsCompleted || 'Completed', o => COMPLETED_STATUSES.has(normalizeStatus(o.status)))}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsOpenBacklog || 'Open Backlog'}
                                    value={formatNumber(analyticsStats.openOrders)}
                                    subLabel={`${formatNumber(analyticsStats.openOlder24h)} ${TRANSLATIONS.analyticsOlder24h || 'older than 24h'}`}
                                    onPress={() => setAnalyticsDetail({ type: 'backlog' })}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsGMVFull || 'Gross Merchandise Value (GMV)'}
                                    value={formatMoney(analyticsStats.gmv)}
                                    subLabel={`${TRANSLATIONS.analyticsAvgOrderValue || 'Average Order Value'} ${formatMoney(analyticsStats.avgTicket)}`}
                                    sparkData={analyticsDailySeries.revenueSeries}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsActiveJobs || 'Active Jobs'}
                                    value={formatNumber(analyticsStats.activeJobs)}
                                    subLabel={`${formatPercent(analyticsStats.urgentShare)} ${TRANSLATIONS.analyticsUrgentShare || 'urgent share'}`}
                                    isDark={isDark}
                                />
                            </View>
                        </>
                    )}

                    {analyticsSection === 'operations' && (
                        <>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsAvailablePool || 'Available Pool'}
                                    value={formatNumber(analyticsStats.availablePool)}
                                    subLabel={`${formatNumber(analyticsStats.claimedCount)} ${TRANSLATIONS.analyticsClaimed || 'claimed'}`}
                                    onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.analyticsAvailablePool || 'Available Pool', o => ['placed', 'reopened'].includes(normalizeStatus(o.status)))}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsInProgress || 'In Progress'}
                                    value={formatNumber(analyticsStats.inProgress)}
                                    subLabel={`${formatNumber(analyticsStats.startedCount)} ${TRANSLATIONS.analyticsStarted || 'started'}`}
                                    onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.analyticsInProgress || 'In Progress', o => ['claimed', 'started'].includes(normalizeStatus(o.status)))}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsOldestOpen || 'Oldest Open'}
                                    value={analyticsStats.oldestOpenAge ? `${analyticsStats.oldestOpenAge.toFixed(1)}h` : '—'}
                                    subLabel={`${TRANSLATIONS.analyticsAvgAge || 'Average Age'} ${analyticsStats.avgOpenAge ? `${analyticsStats.avgOpenAge.toFixed(1)}h` : '—'}`}
                                    onPress={() => setAnalyticsDetail({ type: 'backlog' })}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsUrgentOrders || 'Urgent Orders'}
                                    value={formatNumber(analyticsStats.urgentCount)}
                                    subLabel={`${formatNumber(analyticsStats.emergencyCount)} ${TRANSLATIONS.urgencyEmergency || 'Emergency'}`}
                                    onPress={() => setAnalyticsDetail({ type: 'urgencyMix' })}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsServiceLevelRisk || 'Service Level Risk'}
                                    value={formatNumber(analyticsStats.openOlder48h)}
                                    subLabel={TRANSLATIONS.analyticsOver48h || 'open > 48h'}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsReopened || 'Reopened'}
                                    value={formatNumber(analyticsStats.reopenedCount)}
                                    subLabel={`${formatPercent(analyticsStats.reopenRate)} ${TRANSLATIONS.analyticsReopenRate || 'reopen rate'}`}
                                    isDark={isDark}
                                />
                            </View>
                        </>
                    )}

                    {analyticsSection === 'financial' && (
                        <>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsGMVFull || 'Gross Merchandise Value (GMV)'}
                                    value={formatMoney(analyticsStats.gmv)}
                                    subLabel={`${TRANSLATIONS.analyticsAvgOrderValue || 'Average Order Value'} ${formatMoney(analyticsStats.avgTicket)}`}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsCommissionCollectedFull || 'Commission Collected'}
                                    value={formatMoney(analyticsStats.commissionCollected)}
                                    subLabel={`${TRANSLATIONS.analyticsOutstandingCommission || 'Outstanding Commission'} ${formatMoney(analyticsStats.commissionOutstanding)}`}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsTotalBalances || 'Total Balances'}
                                    value={formatMoney(analyticsStats.totalBalances)}
                                    subLabel={`${analyticsStats.lowBalanceCount} ${TRANSLATIONS.analyticsLowBalance || 'low balance'}`}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsCommissionRate || 'Commission Rate'}
                                    value={formatPercent(analyticsDailySeries.commissionRate || 0)}
                                    subLabel={TRANSLATIONS.analyticsPlatformRate || 'Platform rate'}
                                    isDark={isDark}
                                />
                            </View>
                        </>
                    )}

                    {analyticsSection === 'quality' && (
                        <>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsCancelRate || 'Cancel Rate'}
                                    value={formatPercent(analyticsStats.cancelRate)}
                                    subLabel={`${formatNumber(analyticsStats.canceledOrders)} ${TRANSLATIONS.analyticsCanceled || 'canceled'}`}
                                    onPress={() => setAnalyticsDetail({ type: 'cancelReasons' })}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsCompletionRate || 'Completion Rate'}
                                    value={formatPercent(analyticsStats.completionRate)}
                                    subLabel={`${formatNumber(analyticsStats.completedOrders)} ${TRANSLATIONS.analyticsCompleted || 'completed'}`}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsRepeatClients || 'Repeat Clients'}
                                    value={formatPercent(analyticsStats.repeatRate)}
                                    subLabel={`${formatNumber(analyticsStats.repeatClients)} ${TRANSLATIONS.analyticsClients || 'clients'}`}
                                    isDark={isDark}
                                />
                            </View>
                            <View style={{ width: cardWidth }}>
                                <AnalyticsMetricCard
                                    label={TRANSLATIONS.analyticsReopenRate || 'Reopen Rate'}
                                    value={formatPercent(analyticsStats.reopenRate)}
                                    subLabel={`${formatNumber(analyticsStats.reopenedCount)} ${TRANSLATIONS.analyticsReopened || 'reopened'}`}
                                    isDark={isDark}
                                />
                            </View>
                        </>
                    )}

                    {analyticsSection === 'people' && (
                        <>
                            <View style={{ width: listWidth }}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByCompleted || 'Top by Completed Jobs'}
                                    items={analyticsPeople.topByCompleted}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topPerformersCompleted' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                            <View style={{ width: listWidth }}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue'}
                                    items={analyticsPeople.topByRevenue}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topPerformersRevenue' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                        </>
                    )}
                </View>

                {analyticsSection === 'financial' && (
                    <View style={styles.analyticsVisualGrid}>
                        <View style={{ width: listWidth }}>
                            <View style={[styles.analyticsVisualCard, !isDark && styles.cardLight]}>
                                <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.analyticsGMVvsCommission || 'Gross Merchandise Value vs Commission'}
                                </Text>
                                <DualMiniBars
                                    seriesA={analyticsDailySeries.revenueSeries}
                                    seriesB={analyticsDailySeries.commissionSeries}
                                    isDark={isDark}
                                />
                                <Text style={[styles.analyticsTrendHint, !isDark && styles.textSecondary]}>
                                    {TRANSLATIONS.analyticsLast7d || 'Last 7 days'}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {analyticsSection !== 'people' && (
                    <View style={styles.analyticsListGrid}>
                        <View style={{ width: listWidth }}>
                            <AnalyticsListCard
                                title={TRANSLATIONS.analyticsTopAreas || 'Top Areas'}
                                items={analyticsLists.topAreas}
                                emptyLabel={TRANSLATIONS.emptyList || 'No area data'}
                                onPress={() => setAnalyticsDetail({ type: 'topAreas' })}
                                isDark={isDark}
                                actionLabel={TRANSLATIONS.view || 'View'}
                            />
                        </View>
                        <View style={{ width: listWidth }}>
                            <AnalyticsListCard
                                title={TRANSLATIONS.analyticsTopServices || 'Top Services'}
                                items={analyticsLists.topServices}
                                emptyLabel={TRANSLATIONS.emptyList || 'No service data'}
                                onPress={() => setAnalyticsDetail({ type: 'topServices' })}
                                isDark={isDark}
                                actionLabel={TRANSLATIONS.view || 'View'}
                            />
                        </View>
                        <View style={{ width: listWidth }}>
                            <AnalyticsListCard
                                title={TRANSLATIONS.analyticsUrgencyMix || 'Urgency Mix'}
                                items={analyticsLists.urgencyMix}
                                emptyLabel={TRANSLATIONS.emptyList || 'No urgency data'}
                                onPress={() => setAnalyticsDetail({ type: 'urgencyMix' })}
                                isDark={isDark}
                                actionLabel={TRANSLATIONS.view || 'View'}
                            />
                        </View>
                        <View style={{ width: listWidth }}>
                            <AnalyticsListCard
                                title={TRANSLATIONS.analyticsCancelReasons || 'Cancellation Reasons'}
                                items={analyticsLists.cancelReasons}
                                emptyLabel={TRANSLATIONS.emptyList || 'No cancellations'}
                                onPress={() => setAnalyticsDetail({ type: 'cancelReasons' })}
                                isDark={isDark}
                                actionLabel={TRANSLATIONS.view || 'View'}
                            />
                        </View>
                    </View>
                )}

                <View style={{ height: 100 }} />

                {analyticsDetail.type && (
                    <Modal visible transparent animationType="fade" onRequestClose={() => setAnalyticsDetail({ type: null })}>
                        <View style={styles.modalOverlay}>
                            <View style={[styles.analyticsModalCard, !isDark && styles.cardLight]}>
                                <Text style={[styles.analyticsModalTitle, !isDark && styles.textDark]}>
                                    {detailTitleMap[analyticsDetail.type]}
                                </Text>
                                <ScrollView style={{ maxHeight: 360 }}>
                                    {(detailItemsMap[analyticsDetail.type] || []).length === 0 ? (
                                        <Text style={[styles.analyticsListEmpty, { color: isDark ? '#94a3b8' : '#64748b', textAlign: 'center' }]}>
                                            {TRANSLATIONS.emptyList || 'No data for this range.'}
                                        </Text>
                                    ) : (
                                        detailItemsMap[analyticsDetail.type].map((item, idx) => (
                                            <View key={`${analyticsDetail.type}-${idx}`} style={styles.analyticsDetailRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', fontWeight: '600' }} numberOfLines={1}>{item.label}</Text>
                                                    {item.subLabel ? (
                                                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}>{item.subLabel}</Text>
                                                    ) : null}
                                                </View>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontWeight: '600' }}>{item.value}</Text>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                                <View style={styles.analyticsModalActions}>
                                    {analyticsDetail.type === 'backlog' && (
                                        <TouchableOpacity
                                            style={styles.analyticsModalPrimary}
                                            onPress={() => {
                                                setAnalyticsDetail({ type: null });
                                                openAnalyticsOrdersModal(TRANSLATIONS.analyticsBacklog || 'Backlog Orders', o => ['placed', 'reopened', 'claimed', 'started'].includes(normalizeStatus(o.status)));
                                            }}
                                        >
                                            <Text style={styles.analyticsModalPrimaryText}>{TRANSLATIONS.orders || 'Orders'}</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={styles.analyticsModalSecondary} onPress={() => setAnalyticsDetail({ type: null })}>
                                        <Text style={styles.analyticsModalSecondaryText}>{TRANSLATIONS.close || 'Close'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
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

    const openAnalyticsOrdersModal = (title, predicate) => {
        const list = predicate ? analyticsOrders.filter(predicate) : analyticsOrders;
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
        const statusOptionsWithCounts = STATUS_OPTIONS.map(opt => {
            const label = TRANSLATIONS[opt.label] || opt.label;
            const count = statusCounts[opt.id] ?? 0;
            return { ...opt, label: `${label} (${count})` };
        });

        const currentStatusLabel = TRANSLATIONS[STATUS_OPTIONS.find(o => o.id === statusFilter)?.label] || statusFilter;
        const currentStatusCount = statusCounts[statusFilter] ?? 0;
        const currentDispatcherLabel = dispatcherFilterOptions.find(o => o.id === filterDispatcher)?.label || filterDispatcher;
        const currentUrgencyLabel = TRANSLATIONS[URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label] || filterUrgency;
        const currentServiceLabel = serviceFilterOptions.find(o => o.id === serviceFilter)?.label || serviceFilter;
        const currentSortLabel = TRANSLATIONS[SORT_OPTIONS.find(o => o.id === filterSort)?.label] || filterSort;

        return (
            <View style={styles.filtersContainer}>
                {/* Search */}
                <View style={styles.searchRow}>
                    <View style={[styles.searchInputWrapper, !isDark && styles.btnLight]}>
                        <Text style={styles.searchIcon}>⌕</Text>
                        <TextInput
                            style={[styles.searchInput, !isDark && styles.textDark]}
                            placeholder={TRANSLATIONS.placeholderSearch || 'Search...'}
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
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
                            <Text style={styles.filterDropdownArrow}>▾</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerDispatcher || 'Dispatcher',
                            options: dispatcherFilterOptions,
                            value: filterDispatcher,
                            onChange: setFilterDispatcher
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentDispatcherLabel}
                            </Text>
                            <Text style={styles.filterDropdownArrow}>▾</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerUrgency || 'Urgency',
                            options: URGENCY_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                            value: filterUrgency,
                            onChange: setFilterUrgency
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentUrgencyLabel}
                            </Text>
                            <Text style={styles.filterDropdownArrow}>▾</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerService || 'Service',
                            options: serviceFilterOptions,
                            value: serviceFilter,
                            onChange: setServiceFilter
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                                {currentServiceLabel}
                            </Text>
                            <Text style={styles.filterDropdownArrow}>▾</Text>
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
                            <Text style={styles.filterDropdownArrow}>▾</Text>
                        </TouchableOpacity>

                        {/* Clear Filters Button */}
                        <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => {
                            setStatusFilter('Active');
                            setFilterDispatcher('all');
                            setFilterUrgency('all');
                            setServiceFilter('all');
                            setFilterSort('newest');
                        }}>
                            <Text style={styles.clearFiltersBtnText}>{TRANSLATIONS.clear || 'Clear'}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderOrders = () => {
        // --- Needs Attention Section ---
        const renderNeedsAttention = () => {
            if (needsActionOrders.length === 0) return null;

            // Filter Needs Attention
            const filteredAttention = needsActionOrders.filter(o => {
                if (filterAttentionType === 'All') return true;
                if (filterAttentionType === 'Stuck' && o.status !== 'completed' && !o.is_disputed) return true;
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
            const attentionFilterLabel = ATTENTION_FILTER_OPTIONS.find(o => o.id === filterAttentionType)?.label;

            if (sortedNeedsAction.length === 0 && filterAttentionType !== 'All') return (
                <View style={styles.attentionContainer}>
                    <View style={styles.attentionHeaderRow}>
                        <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
                            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS.needsAttention || 'Needs Attention'} ({needsActionOrders.length})</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerErrorType || 'Issue Type',
                            options: ATTENTION_FILTER_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                            value: filterAttentionType,
                            onChange: setFilterAttentionType
                        })}>
                            <Text style={styles.miniFilterText}>{TRANSLATIONS[attentionFilterLabel] || filterAttentionType}</Text>
                            <Text style={styles.miniFilterArrow}>▾</Text>
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
                            <Text style={[styles.attentionChevron, !isDark && styles.textSecondary]}>{showNeedsAttention ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {/* Attention Filter */}
                            {showNeedsAttention && (
                                <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                                    visible: true,
                                    title: TRANSLATIONS.pickerErrorType || 'Issue Type',
                                    options: ATTENTION_FILTER_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                                    value: filterAttentionType,
                                    onChange: setFilterAttentionType
                                })}>
                                    <Text style={styles.miniFilterText}>{TRANSLATIONS[attentionFilterLabel] || filterAttentionType}</Text>
                                    <Text style={styles.miniFilterArrow}>▾</Text>
                                </TouchableOpacity>
                            )}

                            {/* Sort Button */}
                            {showNeedsAttention && (
                                <TouchableOpacity style={styles.cleanSortBtn} onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}>
                                    <Text style={styles.cleanSortText}>{sortOrder === 'newest' ? (TRANSLATIONS.btnSortNewest || 'Newest') : (TRANSLATIONS.btnSortOldest || 'Oldest')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    {showNeedsAttention && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attentionScroll}>
                            {sortedNeedsAction.map(o => (
                                <TouchableOpacity key={o.id} style={[styles.attentionCard, !isDark && styles.cardLight]} onPress={() => openOrderDetails(o)}>
                                    <Text style={styles.attentionBadge}>
                                        {o.is_disputed ? (TRANSLATIONS.badgeDispute || 'Dispute') :
                                            o.status === 'completed'
                                                ? (TRANSLATIONS.badgeUnpaid || 'Unpaid') :
                                                o.status?.includes('canceled') ? (TRANSLATIONS.badgeCanceled || 'Canceled') :
                                                    (TRANSLATIONS.badgeStuck || 'Stuck')}
                                    </Text>
                                    <Text style={[styles.attentionService, !isDark && styles.textDark]}>{getServiceLabel(o.service_type, t)}</Text>
                                    <Text style={[styles.attentionAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{o.full_address}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            );
        };

        // --- Order Card Renderer (Enhanced) ---
        const renderCard = ({ item }) => (
            <TouchableOpacity style={[styles.orderCard, !isDark && styles.cardLight]} onPress={() => openOrderDetails(item)}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, t)}</Text>
                    <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                        <Text style={styles.cardStatusText}>{getOrderStatusLabel(item.status, t)}</Text>
                    </View>
                </View>
                <Text style={[styles.cardAddr, !isDark && styles.textSecondary]} numberOfLines={2}>{item.full_address}</Text>
                <View style={styles.cardFooter}>
                    <Text style={[styles.cardClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                    <Text style={styles.cardTime}>{getTimeAgo(item.created_at, t)}</Text>
                </View>
                {['placed', 'reopened'].includes(item.status) && (
                    <TouchableOpacity
                        style={styles.cardAssignBtn}
                        onPress={(e) => { e.stopPropagation?.(); openAssignModalFromQueue(item); }}
                    >
                        <Text style={styles.cardAssignText}>{TRANSLATIONS.actionAssign || 'Assign'}</Text>
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );

        // --- Compact Row Renderer (Enhanced - status on LEFT) ---
        const renderCompactRow = ({ item }) => (
            <TouchableOpacity style={[styles.compactRow, !isDark && styles.cardLight]} onPress={() => openOrderDetails(item)}>
                {/* Status indicator on LEFT */}
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
                                {TRANSLATIONS[`urgency${item.urgency.charAt(0).toUpperCase() + item.urgency.slice(1)}`] || item.urgency.toUpperCase()}
                            </Text>
                        )}
                    </View>
                    <Text style={[styles.compactAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{item.full_address}</Text>
                    <View style={styles.compactBottomRow}>
                        <Text style={[styles.compactClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                        {item.master && <Text style={styles.compactMaster}>{TRANSLATIONS.labelMasterPrefix || '→ '}{item.master.full_name}</Text>}
                        {item.final_price && <Text style={styles.compactPrice}>{item.final_price}c</Text>}
                        {['placed', 'reopened'].includes(item.status) && (
                            <TouchableOpacity
                                style={styles.compactAssignBtn}
                                onPress={(e) => { e.stopPropagation?.(); openAssignModalFromQueue(item); }}
                            >
                                <Text style={styles.compactAssignText}>{TRANSLATIONS.actionAssign || 'Assign'}</Text>
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

        const pageSize = viewMode === 'cards' ? 20 : 10;
        const totalPages = Math.ceil(filteredOrders.length / pageSize);
        const paginatedOrders = filteredOrders.slice((queuePage - 1) * pageSize, queuePage * pageSize);

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader(TRANSLATIONS.ordersQueue || TRANSLATIONS.orders || 'Orders')}

                {/* Needs Attention Section */}
                {renderNeedsAttention()}

                {/* Filters */}
                {renderFilters()}

                <FlatList
                    data={paginatedOrders}
                    keyExtractor={item => String(item.id)}
                    key={viewMode}
                    numColumns={viewMode === 'cards' ? 2 : 1}
                    renderItem={viewMode === 'cards' ? renderCard : renderCompactRow}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#3b82f6" : "#0f172a"} />}
                    ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, !isDark && styles.textSecondary]}>{TRANSLATIONS.emptyList || 'No orders found'}</Text></View>}
                    ListFooterComponent={
                        <Pagination
                            currentPage={queuePage}
                            totalPages={totalPages}
                            onPageChange={setQueuePage}
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
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{TRANSLATIONS.noMastersFound || 'No masters found'}</Text>}
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
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3b82f6' }}>{TRANSLATIONS.topUp || 'TOP UP'}</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => setDetailsPerson({ ...item, type: 'master' })}
                                            style={[styles.miniActionBtn, { backgroundColor: isDark ? '#334155' : '#e2e8f0', borderWidth: 1, borderColor: isDark ? '#475569' : '#cbd5e1' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#94a3b8' : '#475569' }}>{TRANSLATIONS.btnEdit || 'EDIT'}</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => handleVerifyMaster(item.id, item.is_verified)}
                                            style={[styles.miniActionBtn, { backgroundColor: item.is_verified ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: item.is_verified ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_verified ? '#ef4444' : '#22c55e' }}>
                                                {item.is_verified ? (TRANSLATIONS.unverify || 'UNVERIFY') : (TRANSLATIONS.verify || 'VERIFY')}
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
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{TRANSLATIONS.noDispatchersFound || 'No dispatchers found'}</Text>}
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
                                            {item.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
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
                                                {item.is_active ? (TRANSLATIONS.deactivate || 'DEACTIVATE') : (TRANSLATIONS.activate || 'ACTIVATE')}
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

    const renderSettingsPage = () => {
        const q = districtSearch.trim().toLowerCase();
        const filteredDistricts = !q
            ? managedDistricts
            : managedDistricts.filter(d =>
                [d.code, d.name_en, d.name_ru, d.name_kg, d.region]
                    .filter(Boolean)
                    .some(val => String(val).toLowerCase().includes(q))
            );

        return (
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
                                        {TRANSLATIONS.configurationSubtitle || 'Platform-wide settings and parameters'}
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
                                            <Text style={[styles.settingsBtnText, !isDark && { color: '#64748b' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
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
                                                    showToast(TRANSLATIONS.settingsSaved || 'Settings saved', 'success');
                                                    loadSettings();
                                                    setIsEditing(false);
                                                } catch (error) {
                                                    showToast(TRANSLATIONS.errorSavingSettings || 'Error saving settings', 'error');
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
                                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.saveChanges || 'Save Changes'}</Text>
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
                                        <Text style={[styles.settingsBtnText, { color: '#3b82f6' }]}>{TRANSLATIONS.editSettings || 'Edit Settings'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Configuration Grid */}
                        <View style={[styles.settingsCard, !isDark && styles.settingsCardLight]}>
                            <View style={styles.settingsGrid}>
                                {/* Row 1 */}
                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.basePayout || 'Default Call-out Fee'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.standardCallout || 'Standard Call-out Fee'}</Text>
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
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.commissionRate || 'Commission Rate'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.platformCommission || 'Platform commission percentage'}</Text>
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
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.priceDeviation || 'Price Deviation'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.thresholdAlerts || 'Threshold for price alerts'}</Text>
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
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.autoClaimTimeout || 'Auto-Claim Timeout'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.minutesExpire || 'Minutes before order expires'}</Text>
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
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.orderExpiry || 'Order Expiry'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.hoursExpire || 'Hours until unclaimed orders expire'}</Text>
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
                    {/* DISTRICTS SECTION */}
                    {/* ============================================ */}
                    <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                        <View style={styles.settingsSectionHeader}>
                            <View style={styles.settingsSectionTitleRow}>
                                <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                                    <Ionicons name="map" size={20} color="#0ea5e9" />
                                </View>
                                <View>
                                    <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.districtsTitle || 'Districts'}
                                    </Text>
                                    <Text style={styles.settingsSectionSubtitle}>
                                        {TRANSLATIONS.districtsSubtitle || 'Manage available districts'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.settingsActionRow}>
                                <TouchableOpacity
                                    onPress={() => setDistrictModal({ visible: true, district: null })}
                                    style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                >
                                    <Ionicons name="add" size={18} color="#fff" />
                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.addDistrict || 'Add District'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setDistrictsCollapsed(prev => !prev)}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={districtsCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!districtsCollapsed && (
                            <>
                                <View style={styles.settingsSearchRow}>
                                    <View style={[styles.searchInputWrapper, !isDark && styles.searchInputWrapperLight]}>
                                        <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={[styles.searchInput, !isDark && styles.searchInputTextLight]}
                                            placeholder={TRANSLATIONS.searchDistricts || 'Search districts...'}
                                            placeholderTextColor="#64748b"
                                            value={districtSearch}
                                            onChangeText={setDistrictSearch}
                                        />
                                        {districtSearch ? (
                                            <TouchableOpacity onPress={() => setDistrictSearch('')} style={styles.searchClear}>
                                                <Ionicons name="close-circle" size={16} color="#64748b" />
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>

                                <ScrollView style={styles.compactList} showsVerticalScrollIndicator={false}>
                                    {filteredDistricts.map((district) => (
                                        <View key={district.id} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                            <View style={styles.serviceTypeRowInfo}>
                                                <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                                    {district[`name_${language}`] || district.name_en || district.code}
                                                </Text>
                                                <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                                    {TRANSLATIONS.code || 'Code:'} {district.code} • {district.region || (TRANSLATIONS.region || 'Region')}: {district.region || '-'} • {district.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                                </Text>
                                            </View>
                                            <View style={styles.serviceTypeRowActions}>
                                                <TouchableOpacity
                                                    onPress={() => setDistrictModal({ visible: true, district })}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeEditBtn, !isDark && styles.serviceTypeActionBtnLight]}
                                                >
                                                    <Ionicons name="pencil" size={16} color="#3b82f6" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeleteDistrict(district.id)}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeDeleteBtn]}
                                                >
                                                    <Ionicons name="trash" size={16} color="#ef4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))}

                                    {filteredDistricts.length === 0 && (
                                        <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                            <Ionicons name="map-outline" size={48} color="#64748b" />
                                            <Text style={styles.settingsEmptyText}>{TRANSLATIONS.noDistricts || 'No districts configured'}</Text>
                                            <Text style={styles.settingsEmptyHint}>{TRANSLATIONS.addFirstDistrict || 'Add your first district to get started'}</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </>
                        )}
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
                                        {TRANSLATIONS.serviceTypesSubtitle || 'Manage available service categories'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.settingsActionRow}>
                                {/* Add Service Type Button */}
                                <TouchableOpacity
                                    onPress={() => setServiceTypeModal({ visible: true, type: null })}
                                    style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                >
                                    <Ionicons name="add" size={18} color="#fff" />
                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.addServiceType || 'Add Service Type'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setServiceTypesCollapsed(prev => !prev)}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={serviceTypesCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!serviceTypesCollapsed && (
                            <ScrollView style={styles.compactList} showsVerticalScrollIndicator={false}>
                                {serviceTypes.map((type) => (
                                    <View key={type.id} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                        <View style={styles.serviceTypeRowInfo}>
                                            <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                                {type[`name_${language}`] || type.name_en || type.id}
                                            </Text>
                                            <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                                {language !== 'ru' && type.name_ru ? type.name_ru : (language !== 'en' && type.name_en ? type.name_en : type.name_kg)} - {TRANSLATIONS.code || 'Code:'} {type.code || type.id}
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

                                {serviceTypes.length === 0 && (
                                    <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                        <Ionicons name="construct-outline" size={48} color="#64748b" />
                                        <Text style={styles.settingsEmptyText}>{TRANSLATIONS.noServiceTypes || 'No service types configured'}</Text>
                                        <Text style={styles.settingsEmptyHint}>{TRANSLATIONS.addFirstService || 'Add your first service type to get started'}</Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Service Type Sidebar Drawer */}
                {renderServiceTypeSidebar()}
                {renderDistrictSidebar()}
            </View>
        );
    };

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
                                    <Ionicons name="globe-outline" size={14} color="#64748b" /> {TRANSLATIONS.localizedNames || 'Localized Names'}
                                </Text>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        {TRANSLATIONS.englishName || 'English Name'}
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
                                        {TRANSLATIONS.russianName || 'Russian Name'}
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
                                        {TRANSLATIONS.kyrgyzName || 'Kyrgyz Name'}
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
                                    placeholder="e.g. oktyabrsky"
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
                                        placeholder="District Name"
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
                                        placeholder="Название района"
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
                                        placeholder="Аймактын аты"
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
                                    placeholder="e.g. Bishkek"
                                    placeholderTextColor="#64748b"
                                />
                            </View>

                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>{TRANSLATIONS.sortOrder || 'Sort Order'}</Text>
                                <TextInput
                                    style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                    value={String(tempDistrict.sort_order || '')}
                                    onChangeText={v => setTempDistrict({ ...tempDistrict, sort_order: v })}
                                    placeholder="99"
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
                                    {districtModal.district ? (TRANSLATIONS.updateDistrict || 'Update District') : (TRANSLATIONS.createDistrict || 'Create District')}
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

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader(TRANSLATIONS.createOrder || 'Create Order')}
                <ScrollView
                    style={styles.createContainer}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.createScrollContent}
                >
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
                                    <Text style={styles.inFieldBtnText}>⎘</Text>
                                </TouchableOpacity>
                            </View>
                            {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}

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
                                <Text style={{ color: '#94a3b8', fontSize: 12 }}>▼</Text>
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
                                <Text style={styles.charCounter}>{newOrder.problemDescription.length}/500</Text>
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

                            {newOrder.urgency === 'planned' && (
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

                                    {showDatePicker && (
                                        <DateTimePicker
                                            value={newOrder.preferredDate ? new Date(newOrder.preferredDate.split('.').reverse().join('-')) : new Date()}
                                            mode="date"
                                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                            onChange={onDateChange}
                                        />
                                    )}
                                    {showTimePicker && (
                                        <DateTimePicker
                                            value={newOrder.preferredTime ? new Date(`1970-01-01T${newOrder.preferredTime}:00`) : new Date()}
                                            mode="time"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                            onChange={onTimeChange}
                                        />
                                    )}
                                </View>
                            )}
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
                                    editable={newOrder.pricingType === 'fixed'}
                                    value={newOrder.initialPrice}
                                    onChangeText={t => setNewOrder({ ...newOrder, initialPrice: sanitizeNumberInput(t) })}
                                />
                            </View>
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
                    </View>

                    <View style={styles.createFooter}>
                        <TouchableOpacity style={styles.confirmRow} onPress={() => setConfirmChecked(!confirmChecked)}>
                            <View style={[styles.checkbox, confirmChecked && styles.checkboxChecked]}>
                                {confirmChecked && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <Text style={[styles.confirmLabel, !isDark && styles.textDark]}>{TRANSLATIONS.confirmDetails || 'Confirm Details'}</Text>
                        </TouchableOpacity>

                        <View style={styles.createButtons}>
                            <TouchableOpacity style={styles.clearBtn} onPress={clearCreateOrderForm}>
                                <Text style={styles.clearBtnText}>↺</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.publishBtn, publishDisabled && styles.publishBtnDisabled]}
                                disabled={publishDisabled}
                                onPress={handleCreateOrder}
                            >
                                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishBtnText}>{TRANSLATIONS.createOrder || 'Create Order'}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
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
                                {(TRANSLATIONS.drawerTitle || 'Order #{0}').replace('{0}', detailsOrder.id?.slice(0, 8) || '')}
                            </Text>
                            <Text style={styles.drawerDate}>
                                {detailsOrder.created_at ? new Date(detailsOrder.created_at).toLocaleString() : ''}
                            </Text>
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
                                <Text style={[styles.drawerActionText, !isDark && styles.textDark, { fontSize: 24 }]}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView style={styles.drawerBody}>
                        <View style={styles.drawerSection}>
                            <View style={styles.drawerStatusRow}>
                                <View style={[styles.drawerStatusBadge, { backgroundColor: STATUS_COLORS[detailsOrder.status] || '#64748b' }]}>
                                    <Text style={styles.drawerStatusText}>{getOrderStatusLabel(detailsOrder.status, t)}</Text>
                                </View>
                                {['placed', 'reopened'].includes(detailsOrder.status) && (
                                    <TouchableOpacity style={styles.drawerBtn} onPress={() => openAssignModalFromQueue(detailsOrder)}>
                                        <Text style={styles.drawerBtnText}>{TRANSLATIONS.actionAssign || TRANSLATIONS.actionClaim || 'Assign'}</Text>
                                    </TouchableOpacity>
                                )}
                                {detailsOrder.status === 'completed' && (
                                    <TouchableOpacity
                                        style={styles.drawerBtn}
                                        onPress={() => {
                                            setPaymentOrder(detailsOrder);
                                            setPaymentData({ method: detailsOrder.payment_method || 'cash', proofUrl: detailsOrder.payment_proof_url || '' });
                                            setShowPaymentModal(true);
                                        }}
                                    >
                                        <Text style={styles.drawerBtnText}>{TRANSLATIONS.confirmPayment || 'Confirm Payment'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

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
                                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>▼</Text>
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
                                        {detailsOrder.orientir && (
                                            <View style={styles.drawerRow}>
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary, { fontStyle: 'italic' }]}> {TRANSLATIONS.labelOrientir || 'Landmark:'} {detailsOrder.orientir}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {detailsOrder.master && (
                                    <View style={styles.drawerSection}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.sectionMaster || 'Master'}</Text>
                                        <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
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
                                        </View>
                                    </View>
                                )}

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

                                {detailsOrder.dispatcher_note && (
                                    <View style={styles.drawerSection}>
                                        <Text style={[styles.drawerSectionTitle, { color: '#f59e0b' }]}>{TRANSLATIONS.sectionNote || 'Internal Note'}</Text>
                                        <Text style={styles.drawerNote}>{detailsOrder.dispatcher_note}</Text>
                                    </View>
                                )}

                                {['canceled_by_master', 'canceled_by_client', 'expired'].includes(detailsOrder.status) && (
                                    <TouchableOpacity style={styles.reopenBtn} onPress={() => handleReopenOrder(detailsOrder.id)}>
                                        <Text style={styles.reopenText}>{TRANSLATIONS.reopenOrder || 'Reopen Order'}</Text>
                                    </TouchableOpacity>
                                )}

                                {['placed', 'reopened', 'expired', 'canceled_by_master'].includes(detailsOrder.status) && (
                                    <TouchableOpacity style={styles.orderCancelBtn} onPress={() => handleCancelOrderAdmin(detailsOrder.id)}>
                                        <Text style={styles.orderCancelText}>{TRANSLATIONS.alertCancelTitle || 'Cancel Order'}</Text>
                                    </TouchableOpacity>
                                )}

                                {detailsOrder.status === 'completed' && detailsOrder.payment_method === 'transfer' && detailsOrder.payment_proof_url && (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS.paymentProofVerification || 'Payment Proof Verification'}</Text>
                                        <View style={styles.editActionRow}>
                                            <TouchableOpacity
                                                style={[styles.editActionBtn, styles.editActionSuccess]}
                                                onPress={() => handleVerifyPaymentProof(detailsOrder.id, true)}
                                                disabled={actionLoading}
                                            >
                                                <Text style={styles.editActionText}>{TRANSLATIONS.approve || 'Approve'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.editActionBtn, styles.editActionDanger]}
                                                onPress={() => handleVerifyPaymentProof(detailsOrder.id, false)}
                                                disabled={actionLoading}
                                            >
                                                <Text style={styles.editActionText}>{TRANSLATIONS.reject || 'Reject'}</Text>
                                            </TouchableOpacity>
                                        </View>
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


    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS.confirmPayment || 'Confirm Payment'}</Text>
                    <Text style={styles.modalSubtitle}>
                        {(TRANSLATIONS.modalOrderPrefix || 'Order #{0}').replace('{0}', paymentOrder?.id?.slice(-8) || '')}
                    </Text>
                    <Text style={styles.modalAmount}>
                        {(paymentOrder?.final_price || paymentOrder?.initial_price || 'N/A')}c
                    </Text>
                    <View style={styles.paymentMethods}>
                        {['cash', 'transfer', 'card'].map(m => (
                            <TouchableOpacity
                                key={m}
                                style={[styles.paymentMethod, paymentData.method === m && styles.paymentMethodActive]}
                                onPress={() => setPaymentData({ ...paymentData, method: m })}
                            >
                                <Text style={[styles.paymentMethodText, paymentData.method === m && { color: '#fff' }]}>
                                    {TRANSLATIONS[`payment${m.charAt(0).toUpperCase() + m.slice(1)}`] || m}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {paymentData.method === 'transfer' && (
                        <TextInput
                            style={styles.input}
                            placeholder={TRANSLATIONS.labelProof || 'Proof URL'}
                            value={paymentData.proofUrl}
                            onChangeText={t => setPaymentData({ ...paymentData, proofUrl: t })}
                            placeholderTextColor="#64748b"
                        />
                    )}
                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.modalCancel}
                            onPress={() => { setShowPaymentModal(false); setPaymentOrder(null); }}
                        >
                            <Text style={styles.modalCancelText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modalConfirm, actionLoading && styles.pointerEventsNone]}
                            onPress={actionLoading ? undefined : handleConfirmPaymentModal}
                        >
                            {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>{TRANSLATIONS.confirm || 'Confirm'}</Text>}
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
                onRequestClose={() => setShowAssignModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: 500 }]}>
                        <Text style={styles.modalTitle}>{TRANSLATIONS.forceAssignMaster || 'Force Assign Master'}</Text>
                        <Text style={{ color: '#94a3b8', marginBottom: 15 }}>
                            {TRANSLATIONS.selectMasterAssign || 'Select a master to assign this order to:'}
                        </Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {availableMasters.length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', paddingVertical: 20 }}>
                                    {TRANSLATIONS.noAvailableMasters || 'No available masters found'}
                                </Text>
                            ) : (
                                availableMasters.map(master => {
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
                                                    <Text style={styles.itemSubtitle}>{master.phone || 'N/A'} • {(TRANSLATIONS.labelJobs || TRANSLATIONS.orders || 'Jobs')}: {jobsLabel}</Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={16} color="#64748b" />
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#334155', marginTop: 16 }]}
                            onPress={() => setShowAssignModal(false)}
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
                onRequestClose={() => setShowBalanceModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>{TRANSLATIONS.addMasterBalance || 'Add Master Balance'}</Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            {TRANSLATIONS.master || 'Master'}: {selectedMaster?.full_name}
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
                            placeholder={TRANSLATIONS.notesOptional || 'Notes (optional)'}
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
                                <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleAddMasterBalance(selectedMaster?.id, balanceData.amount, balanceData.type, balanceData.notes)}
                                disabled={actionLoading || !balanceData.amount}
                            >
                                <Text style={styles.actionButtonText}>{actionLoading ? (TRANSLATIONS.saving || 'Saving...') : (TRANSLATIONS.addBalance || 'Add Balance')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Person Details Drawer (Master/Dispatcher) */}
            <Modal visible={!!detailsPerson} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailsPerson(null)} />
                    <View style={{ width: Math.min(500, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[styles.avatarCircle, { width: 48, height: 48, borderRadius: 24, backgroundColor: detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? '#22c55e' : '#64748b') : (detailsPerson?.is_active ? '#3b82f6' : '#64748b') }]}>
                                    <Text style={{ color: '#fff', fontSize: 18 }}>{detailsPerson?.full_name?.charAt(0)}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{detailsPerson?.full_name}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? '#22c55e' : '#64748b') : (detailsPerson?.is_active ? '#3b82f6' : '#64748b'), alignSelf: 'flex-start', marginTop: 4 }]}>
                                        <Text style={styles.statusText}>
                                            {detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? (TRANSLATIONS.verified || 'VERIFIED') : (TRANSLATIONS.unverified || 'UNVERIFIED')) : (detailsPerson?.is_active ? (TRANSLATIONS.active || 'ACTIVE').toUpperCase() : (TRANSLATIONS.inactive || 'INACTIVE').toUpperCase())}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setDetailsPerson(null)}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Contact Info - Editable when isEditingPerson */}
                            <View style={[styles.card, !isDark && styles.cardLight]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>{TRANSLATIONS.contactInfo || 'CONTACT INFO'}</Text>
                                    {!isEditingPerson && (
                                        <TouchableOpacity onPress={() => { setIsEditingPerson(true); setEditPersonData({ ...detailsPerson }); }}>
                                            <Text style={{ color: '#3b82f6', fontSize: 12 }}>{TRANSLATIONS.edit || 'Edit'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {isEditingPerson ? (
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
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.phone || ''}
                                                onChangeText={(text) => setEditPersonData({ ...editPersonData, phone: text })}
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.email || 'Email'}</Text>
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
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.serviceArea || 'Service Area'}</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={editPersonData.service_area || ''}
                                                        onChangeText={(text) => setEditPersonData({ ...editPersonData, service_area: text })}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{TRANSLATIONS.experienceYears || 'Experience (years)'}</Text>
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
                                                <Text style={styles.actionButtonText}>{actionLoading ? (TRANSLATIONS.saving || 'Saving...') : (TRANSLATIONS.saveChanges || 'Save Changes')}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                onPress={() => setIsEditingPerson(false)}
                                            >
                                                <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
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
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>{TRANSLATIONS.financials || 'FINANCIALS'}</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.balance || 'Balance:'}</Text>
                                                <Text style={{ color: (detailsPerson?.prepaid_balance || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700' }}>{detailsPerson?.prepaid_balance || 0} сом</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.initialDeposit || 'Initial Deposit:'}</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.initial_deposit || 0} сом</Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>{TRANSLATIONS.performance || 'PERFORMANCE'}</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.completedJobs || 'Completed Jobs:'}</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.completed_jobs || 0}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Master Actions */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                            onPress={() => openOrderHistory(detailsPerson)}
                                        >
                                            <Text style={styles.actionButtonText}>{TRANSLATIONS.viewOrderHistory || 'View Order History'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
                                            onPress={() => { setSelectedMaster(detailsPerson); setShowBalanceModal(true); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{TRANSLATIONS.topUpBalance || 'Top Up Balance'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_verified ? '#ef4444' : '#22c55e' }]}
                                            onPress={() => { handleVerifyMaster(detailsPerson?.id, detailsPerson?.is_verified); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{detailsPerson?.is_verified ? (TRANSLATIONS.unverifyMaster || 'Unverify Master') : (TRANSLATIONS.verifyMaster || 'Verify Master')}</Text>
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
                                    </View>
                                </>
                            )}

                            {/* Dispatcher-specific info */}
                            {detailsPerson?.type === 'dispatcher' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>{TRANSLATIONS.stats || 'STATS'}</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.status || 'Status:'}</Text>
                                                <Text style={{ color: detailsPerson?.is_active ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{detailsPerson?.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>{TRANSLATIONS.created || 'Created:'}</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.created_at ? new Date(detailsPerson.created_at).toLocaleDateString() : 'N/A'}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Dispatcher Actions */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                            onPress={() => openOrderHistory(detailsPerson)}
                                        >
                                            <Text style={styles.actionButtonText}>{TRANSLATIONS.viewOrderHistory || 'View Order History'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_active ? '#ef4444' : '#22c55e' }]}
                                            onPress={() => { handleToggleDispatcher(detailsPerson?.id, detailsPerson?.is_active); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{detailsPerson?.is_active ? (TRANSLATIONS.deactivate || 'Deactivate') : (TRANSLATIONS.activate || 'Activate')}</Text>
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
                    <View style={{ width: Math.min(500, SCREEN_WIDTH), backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{TRANSLATIONS.sectionHistory || 'Order History'}</Text>
                                <Text style={{ color: '#64748b', marginTop: 4 }}>{selectedMaster?.full_name}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowOrderHistoryModal(false)}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>X</Text>
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
                                                setDetailsPerson(null);
                                                openOrderDetails(order);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{getServiceLabel(order.service_type, t)}</Text>
                                                    <Text style={styles.itemSubtitle}>{order.area || 'N/A'}</Text>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 14 }}>
                                                        {order.final_price ?? order.initial_price ?? order.callout_fee ?? '-'} сом
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
                            {addUserRole === 'master' ? (TRANSLATIONS.createNewMasterAccount || 'Create a new master account') : (TRANSLATIONS.createNewDispatcherAccount || 'Create a new dispatcher account')}
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
                                <Text style={styles.actionButtonText}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: addUserRole === 'master' ? '#22c55e' : '#3b82f6' }]}
                                onPress={handleCreateUser}
                                disabled={actionLoading || !newUserData.email || !newUserData.password || !newUserData.full_name}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading ? (TRANSLATIONS.creating || 'Creating...') : (addUserRole === 'master' ? (TRANSLATIONS.createMaster || 'Create Master') : (TRANSLATIONS.createDispatcher || 'Create Dispatcher'))}
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
                                ⚠️ {TRANSLATIONS.resetPasswordWarning || "This action will immediately change the user's password. They will need to use the new password to login."}
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
    masterDetailsCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24 },
    masterDetailsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    masterDetailsName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
    masterDetailsSub: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
    masterDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    masterDetailsLabel: { fontSize: 12, color: '#64748b' },
    masterDetailsValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
    masterDetailsBlocked: { marginTop: 8, fontSize: 12, color: '#ef4444', fontWeight: '600' },
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
    drawerOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
    drawerOverlayWeb: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 500 },
    drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    drawerBackdropHidden: { flex: 0, width: 0 },
    drawerContent: { width: SCREEN_WIDTH > 500 ? 400 : SCREEN_WIDTH * 0.85, maxWidth: '100%', backgroundColor: '#1e293b', height: '100%' },
    drawerContentLight: { backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e2e8f0' },
    drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    drawerHeaderLight: { borderBottomColor: '#f1f5f9' },
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
    drawerCardLight: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1 },
    drawerCardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
    drawerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    drawerRowText: { fontSize: 13, color: '#94a3b8', flex: 1 },
    drawerRowBtns: { flexDirection: 'row', gap: 8 },
    drawerDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 20 },
    masterHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    masterDetailsBtn: { backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    masterDetailsBtnText: { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
    finRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    finLabel: { fontSize: 12, color: '#64748b' },
    finValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
    drawerNote: { fontSize: 13, color: '#f59e0b', fontStyle: 'italic', backgroundColor: 'rgba(245,158,11,0.1)', padding: 10, borderRadius: 8 },
    drawerIconBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 6 },
    drawerIconBtnText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },
    editSection: { marginBottom: 16 },
    saveEditBtn: { backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
    saveEditText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    reopenBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    reopenText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    orderCancelBtn: { backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    orderCancelText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    forceAssignBtn: { backgroundColor: '#8b5cf6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    forceAssignText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    editActionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    editActionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    editActionPrimary: { backgroundColor: '#3b82f6' },
    editActionDanger: { backgroundColor: '#ef4444' },
    editActionSuccess: { backgroundColor: '#22c55e' },
    editActionText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    editBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },

    // Hamburger Sidebar Styles
    sidebarOverlay: { flex: 1, flexDirection: 'row' },
    sidebarContainer: { width: 280, height: '100%', backgroundColor: '#1e293b', borderRightWidth: 1, borderRightColor: 'rgba(71,85,105,0.3)' },
    sidebarHeader: { height: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    sidebarTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    sidebarClose: { padding: 8 },
    sidebarCloseText: { fontSize: 16, color: '#94a3b8' },
    sidebarNav: { flex: 1, paddingVertical: 20, paddingHorizontal: 16 },
    sidebarNavItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4 },
    sidebarNavItemActive: { backgroundColor: '#3b82f6' },
    sidebarNavIcon: { fontSize: 18, marginRight: 12, width: 24, textAlign: 'center' },
    sidebarNavText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    sidebarNavTextActive: { color: '#fff' },
    sidebarNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    sidebarBadge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
    sidebarBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    createOrderBtn: { marginTop: 12, borderWidth: 1, borderColor: '#22c55e', borderStyle: 'dashed' },
    sidebarFooter: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(71,85,105,0.3)' },
    sidebarUserCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12 },
    sidebarUserAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
    sidebarUserAvatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    sidebarUserInfo: { flex: 1, marginLeft: 10 },
    sidebarUserName: { fontSize: 13, fontWeight: '700', color: '#fff' },
    sidebarUserStatus: { fontSize: 10, color: '#22c55e' },
    sidebarLogoutBtn: { padding: 8 },
    sidebarLogoutText: { fontSize: 16, color: '#ef4444' },
    sidebarBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sidebarButtonRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    sidebarSmallBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    sidebarThemeIcon: { fontSize: 20, color: '#94a3b8' },
    sidebarLangBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    sidebarLangText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
    compactStatusBadge: { minWidth: 130, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    compactStatusText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', textAlign: 'center' },
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

    // Queue
    queueContainer: { flex: 1 },
    listContent: { paddingBottom: 20 },
    empty: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 14, color: '#64748b' },

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

    // Assign Buttons
    cardAssignBtn: { backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 8 },
    cardAssignText: { fontSize: 12, fontWeight: '700', color: '#60a5fa' },
    compactAssignBtn: { backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    compactAssignText: { fontSize: 10, fontWeight: '700', color: '#60a5fa' },

    // Card Pay Button
    cardPayBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    cardPayText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // Create Order Styles (Dispatcher parity)
    createContainer: { flex: 1 },
    createScrollContent: { paddingBottom: 40 },
    createSections: { gap: 12 },
    formSection: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 16, padding: 16 },
    formSectionLight: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
    formSectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 },
    inputLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
    input: { backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 },
    inputError: { borderWidth: 1, borderColor: '#ef4444' },
    inputWithIcon: { position: 'relative' },
    inputWithPaste: { paddingRight: 40 },
    inFieldBtn: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' },
    inFieldBtnText: { fontSize: 14, fontWeight: '700', color: '#60a5fa' },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    pickerInput: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pickerBtnText: { color: '#fff', fontSize: 14 },
    placeholderText: { color: '#64748b' },
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
    plannedPickerContainer: { marginTop: 8, gap: 8 },
    plannedTimeRow: { flexDirection: 'row', gap: 8 },
    plannedDateInput: { flex: 1 },
    plannedTimeInput: { flex: 1 },
    webPickerInput: { justifyContent: 'center', paddingVertical: 6 },
    datePickerButton: { justifyContent: 'center' },
    datePickerText: { color: '#fff' },
    pricingRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    pricingBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.3)', alignItems: 'center' },
    pricingBtnActive: { backgroundColor: '#22c55e' },
    pricingBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    charCounter: { position: 'absolute', right: 10, bottom: 8, fontSize: 10, color: '#64748b' },
    createFooter: { backgroundColor: 'rgba(30,41,59,0.95)', borderRadius: 16, padding: 16, marginTop: 12 },
    confirmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#64748b', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
    confirmLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
    createButtons: { flexDirection: 'row', gap: 8 },
    clearBtn: { width: 50, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
    clearBtnText: { fontSize: 18, color: '#fff' },
    publishBtn: { flex: 1, borderRadius: 10, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
    publishBtnDisabled: { backgroundColor: '#334155', opacity: 0.6 },
    publishBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    errorText: { fontSize: 10, color: '#ef4444', marginTop: 4 },

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
    textSecondary: { color: '#64748b' },
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
    pointerEventsNone: { pointerEvents: 'none' },

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
    settingsSearchRow: {
        marginBottom: 12,
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
    compactList: {
        marginTop: 12,
        maxHeight: 320,
    },
    collapseBtn: {
        width: 38,
        height: 38,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: 'rgba(71,85,105,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
    },
    collapseBtnLight: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
    },
    togglePill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    toggleActive: {
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(34,197,94,0.35)',
    },
    toggleInactive: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.35)',
    },
    toggleText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#94a3b8',
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
    // ============================================
    // ANALYTICS STYLES
    // ============================================
    analyticsFilterCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    analyticsFilterHeader: {
        marginBottom: 12,
    },
    analyticsSectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    analyticsRangeRow: {
        flexDirection: 'row',
        gap: 6,
    },
    analyticsRangeChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
    },
    analyticsRangeChipActive: {
        backgroundColor: '#3b82f6',
    },
    analyticsRangeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94a3b8',
    },
    analyticsRangeTextActive: {
        color: '#fff',
    },
    analyticsFilterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    analyticsFilterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
        minWidth: 100,
    },
    analyticsFilterPillActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    analyticsFilterPillLight: {
        backgroundColor: '#f1f5f9',
    },
    analyticsFilterPillRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    analyticsFilterPillText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#cbd5e1',
    },
    analyticsClearBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    analyticsClearBtnText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ef4444',
    },
    analyticsCustomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 12,
    },
    analyticsCustomButton: {
        flex: 1,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
        borderRadius: 8,
        padding: 12,
    },
    analyticsCustomButtonLight: {
        backgroundColor: '#f1f5f9',
    },
    analyticsCustomLabel: {
        fontSize: 10,
        color: '#64748b',
        marginBottom: 4,
    },
    analyticsCustomValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    analyticsCustomSeparator: {
        fontSize: 16,
        color: '#64748b',
    },
    analyticsSectionTabs: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 16,
    },
    analyticsSectionTab: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
    },
    analyticsSectionTabActive: {
        backgroundColor: '#3b82f6',
    },
    analyticsSectionTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#94a3b8',
    },
    analyticsSectionTabTextActive: {
        color: '#fff',
    },
    analyticsGranularityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    analyticsGranularityLabel: {
        fontSize: 12,
        color: '#64748b',
    },
    analyticsGranularityChips: {
        flexDirection: 'row',
        gap: 6,
    },
    analyticsGranularityChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
    },
    analyticsGranularityChipActive: {
        backgroundColor: '#22c55e',
    },
    analyticsGranularityText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94a3b8',
    },
    analyticsGranularityTextActive: {
        color: '#fff',
    },
    analyticsChartGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 16,
    },
    analyticsVisualGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 16,
    },
    analyticsVisualCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    analyticsVisualTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    analyticsMetricGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
    },
    analyticsMetricCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
        minHeight: 90,
    },
    analyticsMetricTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    analyticsMetricLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: '#94a3b8',
        marginBottom: 4,
    },
    analyticsMetricValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    analyticsMetricSub: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 6,
    },
    analyticsListGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 16,
    },
    analyticsListCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    analyticsListHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    analyticsListTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    analyticsListAction: {
        fontSize: 12,
        fontWeight: '600',
        color: '#3b82f6',
    },
    analyticsListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    analyticsListLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: '#cbd5e1',
    },
    analyticsListBar: {
        height: 4,
        backgroundColor: '#334155',
        borderRadius: 2,
        marginTop: 4,
        overflow: 'hidden',
    },
    analyticsListBarFill: {
        height: 4,
        backgroundColor: '#3b82f6',
        borderRadius: 2,
    },
    analyticsListValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
        marginLeft: 12,
    },
    analyticsListEmpty: {
        fontSize: 12,
        color: '#64748b',
        textAlign: 'center',
        paddingVertical: 16,
    },
    analyticsMiniBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    analyticsMiniBarTrack: {
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    analyticsMiniBar: {
        borderRadius: 2,
    },
    analyticsDualBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
    },
    analyticsDualBarTrack: {
        width: 16,
        height: 40,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    analyticsDualBarPrimary: {
        width: 6,
        borderRadius: 2,
    },
    analyticsDualBarSecondary: {
        width: 6,
        borderRadius: 2,
    },
    analyticsStatusStrip: {
        flexDirection: 'row',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    analyticsStatusSegment: {
        minWidth: 4,
    },
    analyticsStatusLegend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    analyticsStatusLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    analyticsStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    analyticsStatusLegendText: {
        fontSize: 11,
        fontWeight: '500',
        color: '#cbd5e1',
    },
    analyticsStatusLegendValue: {
        fontSize: 11,
        fontWeight: '600',
        color: '#94a3b8',
    },
    analyticsFunnelRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        gap: 8,
    },
    analyticsFunnelItem: {
        alignItems: 'center',
        flex: 1,
    },
    analyticsFunnelBar: {
        width: '80%',
        borderRadius: 4,
        marginBottom: 6,
    },
    analyticsFunnelLabel: {
        fontSize: 9,
        fontWeight: '500',
        color: '#cbd5e1',
        textAlign: 'center',
    },
    analyticsFunnelValue: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94a3b8',
    },
    analyticsChartCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    analyticsChartHeader: {
        marginBottom: 12,
    },
    analyticsChartTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    analyticsChartSubtitle: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    analyticsChartBars: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 100,
        gap: 4,
    },
    analyticsChartColumn: {
        flex: 1,
        alignItems: 'center',
    },
    analyticsChartValue: {
        fontSize: 10,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    analyticsChartTrack: {
        width: '80%',
        backgroundColor: '#334155',
        borderRadius: 4,
        justifyContent: 'flex-end',
        alignItems: 'center',
        overflow: 'hidden',
        height: 78,
    },
    analyticsChartFill: {
        width: '100%',
        borderRadius: 4,
    },
    analyticsChartLabel: {
        fontSize: 9,
        color: '#64748b',
        marginTop: 6,
        textAlign: 'center',
    },
    analyticsTrendHint: {
        fontSize: 10,
        color: '#64748b',
        marginTop: 8,
        textAlign: 'center',
    },
    analyticsModalCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        width: 400,
        maxWidth: '90%',
        maxHeight: '80%',
        borderWidth: 1,
        borderColor: '#334155',
    },
    analyticsModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
    },
    analyticsDetailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    analyticsModalActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
    },
    analyticsModalPrimary: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#3b82f6',
        alignItems: 'center',
    },
    analyticsModalPrimaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    analyticsModalSecondary: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
        alignItems: 'center',
    },
    analyticsModalSecondaryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94a3b8',
    },
});
