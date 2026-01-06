/**
 * Master Dashboard - v5.3
 * Refinements:
 * - Lucide Icons
 * - Proper Dropdown Filters
 * - Strict Visibility Rules (Completed = No Client Data)
 * - Sorting: Started > Claimed > Completed
 * - Finances Time Filter
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    Platform,
    Dimensions,
    Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    LogOut, ShieldCheck, Moon, Sun, LayoutGrid, Briefcase, Wallet,
    MapPin, Check, X, Filter, ChevronDown, ChevronUp, Inbox,
    SearchX, ClipboardList, TrendingUp, AlertCircle, CheckCircle2,
    Phone, User, Clock, DollarSign, RotateCw
} from 'lucide-react-native';

// Services
import authService from '../services/auth';
import ordersService, { ORDER_STATUS, CANCEL_REASONS } from '../services/orders';
import earningsService from '../services/earnings';

// Contexts
import { useToast } from '../contexts/ToastContext';
import { useLocalization, LocalizationProvider } from '../contexts/LocalizationContext';
import { useTheme, ThemeProvider } from '../contexts/ThemeContext';

// Utils
import deviceUtils from '../utils/device';

const LOG_PREFIX = '[MasterDashboard]';

// Cancel reasons aligned with database
const CANCEL_REASONS_MAP = {
    scope_mismatch: 'reasonScopeMismatch',
    client_unavailable: 'reasonClientUnavailable',
    safety_risk: 'reasonSafetyRisk',
    tools_missing: 'reasonToolsMissing',
    materials_unavailable: 'reasonMaterialsUnavailable',
    address_unreachable: 'reasonAddressUnreachable',
    client_request: 'reasonClientRequest',
    other: 'reasonOther',
};

const STANDARD_SERVICES = [
    'Plumbing', 'Cleaning', 'Construction', 'Carpenter', 'Electrician', 'Painting', 'Other'
];

// ============================================
// DROPDOWN COMPONENT (Custom)
// ============================================
const Dropdown = ({ label, value, options, optionLabels = {}, onChange, zIndex = 1 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { theme } = useTheme();
    const isActive = value !== 'all';
    const buttonRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const toggleDropdown = () => {
        if (!isOpen && buttonRef.current) {
            buttonRef.current.measure((fx, fy, width, height, px, py) => {
                setPosition({ top: py + height + 4, left: px, width: Math.max(width, 160) });
                setIsOpen(true);
            });
        } else {
            setIsOpen(false);
        }
    };

    const displayValue = optionLabels[value] || value;

    return (
        <View style={[styles.dropdownWrapper, { zIndex }]}>
            <TouchableOpacity
                ref={buttonRef}
                style={[
                    styles.dropdownButton,
                    {
                        backgroundColor: isActive ? `${theme.accentIndigo}15` : theme.bgCard,
                        borderColor: isActive ? theme.accentIndigo : theme.borderPrimary,
                    }
                ]}
                onPress={toggleDropdown}
            >
                <Text style={[
                    styles.dropdownLabel,
                    { color: isActive ? theme.accentIndigo : theme.textSecondary }
                ]}>
                    {value === 'all' ? label : displayValue}
                </Text>
                <ChevronDown size={14} color={isActive ? theme.accentIndigo : theme.textMuted} />
            </TouchableOpacity>

            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
                    <View style={[
                        styles.dropdownMenu,
                        {
                            top: position.top,
                            left: position.left,
                            width: position.width,
                            backgroundColor: theme.bgSecondary,
                            borderColor: theme.borderPrimary,
                        }
                    ]}>
                        <ScrollView style={{ maxHeight: 250 }}>
                            {options.map((opt) => (
                                <TouchableOpacity
                                    key={opt}
                                    style={[
                                        styles.dropdownItem,
                                        value === opt && { backgroundColor: `${theme.accentIndigo}15` }
                                    ]}
                                    onPress={() => { onChange(opt); setIsOpen(false); }}
                                >
                                    {value === opt && <Check size={14} color={theme.accentIndigo} style={styles.checkIcon} />}
                                    <Text style={[
                                        styles.dropdownItemText,
                                        {
                                            color: value === opt ? theme.accentIndigo : theme.textPrimary,
                                            marginLeft: value === opt ? 6 : 20
                                        }
                                    ]}>
                                        {optionLabels[opt] || opt}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

// ============================================
// HEADER COMPONENT
// ============================================
const Header = ({ user, onLogout, onLanguageToggle, onThemeToggle, onRefresh }) => {
    const { t, language } = useLocalization();
    const { theme, isDark } = useTheme();

    const getFlagEmoji = () => {
        switch (language) {
            case 'ru': return '🇷🇺';
            case 'kg': return '🇰🇬';
            default: return '🇬🇧';
        }
    };

    return (
        <View style={[styles.header, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}>
            <View style={styles.headerLeft}>
                {user ? (
                    <>
                        <Text style={[styles.userName, { color: theme.textPrimary }]} numberOfLines={1}>
                            {user.full_name || 'Master'}
                        </Text>
                        {user.is_verified && (
                            <View style={[styles.verifiedBadge, { backgroundColor: `${theme.accentSuccess}20`, borderColor: theme.accentSuccess }]}>
                                <ShieldCheck size={12} color={theme.accentSuccess} style={{ marginRight: 4 }} />
                                <Text style={[styles.verifiedText, { color: theme.accentSuccess }]}>
                                    {t('verified')}
                                </Text>
                            </View>
                        )}
                        {!user.is_verified && (
                            <View style={[styles.verifiedBadge, { backgroundColor: `${theme.accentDanger}20`, borderColor: theme.accentDanger }]}>
                                <AlertCircle size={12} color={theme.accentDanger} style={{ marginRight: 4 }} />
                                <Text style={[styles.verifiedText, { color: theme.accentDanger }]}>
                                    {t('unverified')}
                                </Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={[styles.skeletonName, { backgroundColor: theme.borderSecondary }]} />
                )}
            </View>

            <View style={styles.headerRight}>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onRefresh}>
                    <RotateCw size={18} color={theme.accentIndigo} />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onLanguageToggle}>
                    <Text style={{ fontSize: 16 }}>{getFlagEmoji()}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onThemeToggle}>
                    {isDark ? <Sun size={18} color="#FFD700" /> : <Moon size={18} color={theme.accentIndigo} />}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.headerButton, { backgroundColor: `${theme.accentDanger}15` }]} onPress={onLogout}>
                    <LogOut size={18} color={theme.accentDanger} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ============================================
// FILTER BAR COMPONENT (Refined)
// ============================================
const FilterBar = ({ filters, setFilters, availableServices, availableAreas, serviceLabels }) => {
    const { t } = useLocalization();
    const { theme } = useTheme();
    const [expanded, setExpanded] = useState(false);

    const hasActiveFilters = Object.values(filters).some(v => v !== 'all');

    // Toggle filter visibility
    const toggleFilters = () => setExpanded(!expanded);

    const clearFilters = () => {
        setFilters({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' });
    };

    // (Internal serviceLabels logic removed, utilizing passed prop)

    return (
        <View style={[styles.filterContainer, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}>
            {/* Filter Toggle Button */}
            <TouchableOpacity
                style={[styles.filterHeader, { backgroundColor: expanded ? theme.bgCard : 'transparent' }]}
                onPress={toggleFilters}
            >
                <View style={styles.filterHeaderLeft}>
                    <Filter size={16} color={hasActiveFilters ? theme.accentIndigo : theme.textSecondary} />
                    <Text style={[
                        styles.filterHeaderText,
                        { color: hasActiveFilters ? theme.accentIndigo : theme.textSecondary }
                    ]}>
                        {t('filterLabel')}
                    </Text>
                    {hasActiveFilters && (
                        <View style={[styles.filterBadge, { backgroundColor: theme.accentIndigo }]}>
                            <Text style={styles.filterBadgeText}>!</Text>
                        </View>
                    )}
                </View>
                <Text style={{ color: theme.textMuted }}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Text>
            </TouchableOpacity>

            {/* Collapsible Action Area */}
            {expanded && (
                <View style={styles.filterBody}>
                    <ScrollView horizontal contentContainerStyle={styles.filterScroll} showsHorizontalScrollIndicator={false}>
                        <Dropdown
                            label={t('filterUrgency')}
                            value={filters.urgency}
                            options={['all', 'emergency', 'urgent', 'planned']}
                            optionLabels={{
                                all: t('filterAll'),
                                emergency: t('urgencyEmergency'),
                                urgent: t('urgencyUrgent'),
                                planned: t('urgencyPlanned'),
                            }}
                            onChange={(v) => setFilters({ ...filters, urgency: v })}
                        />
                        <Dropdown
                            label={t('filterService')}
                            value={filters.service}
                            options={['all', ...availableServices]}
                            optionLabels={serviceLabels}
                            onChange={(v) => setFilters({ ...filters, service: v })}
                        />
                        <Dropdown
                            label={t('filterArea')}
                            value={filters.area}
                            options={['all', ...availableAreas]}
                            optionLabels={{ all: t('filterAll') }}
                            onChange={(v) => setFilters({ ...filters, area: v })}
                        />
                        <Dropdown
                            label={t('filterPrice')}
                            value={filters.pricing}
                            options={['all', 'fixed', 'unknown']}
                            optionLabels={{
                                all: t('filterAll'),
                                fixed: t('pricingFixed'),
                                unknown: t('pricingUnknown'),
                            }}
                            onChange={(v) => setFilters({ ...filters, pricing: v })}
                        />

                        {hasActiveFilters && (
                            <TouchableOpacity
                                style={[styles.clearButton, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                                onPress={clearFilters}
                            >
                                <X size={14} color={theme.textSecondary} />
                                <Text style={[styles.clearButtonText, { color: theme.textSecondary }]}>{t('filterClear')}</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

// ============================================
// PAGINATION COMPONENT
// ============================================
const Pagination = ({ current, total, onPageChange }) => {
    const { theme } = useTheme();
    if (total <= 1) return null;

    return (
        <View style={styles.pagination}>
            {Array.from({ length: total }, (_, i) => i + 1).map(p => (
                <TouchableOpacity
                    key={p}
                    style={[
                        styles.pageBtn,
                        {
                            borderColor: current === p ? theme.accentIndigo : theme.borderPrimary,
                            backgroundColor: current === p ? `${theme.accentIndigo}15` : theme.bgCard
                        }
                    ]}
                    onPress={() => onPageChange(p)}
                >
                    <Text style={{
                        color: current === p ? theme.accentIndigo : theme.textPrimary,
                        fontWeight: current === p ? '700' : '500'
                    }}>{p}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

// ============================================
// ORDER CARD COMPONENT
// ============================================
const OrderCard = ({ order, isPool, userVerified, actionLoading, isHighlighted, onClaim, onStart, onComplete, onRefuse }) => {
    const { t } = useLocalization();
    const { theme } = useTheme();
    const { width } = Dimensions.get('window');
    const columns = deviceUtils.getGridColumns();

    const isConfirmed = order.status === 'confirmed';
    const isStarted = order.status === 'started';
    const isClaimed = order.status === 'claimed';
    const isCompleted = order.status === 'completed';

    // Status color
    const getStatusColor = () => {
        switch (order.status) {
            case 'placed': return theme.statusPlaced;
            case 'claimed': return theme.statusClaimed;
            case 'started': return theme.statusStarted;
            case 'completed': return theme.statusCompleted;
            case 'confirmed': return theme.statusConfirmed;
            default: return theme.statusCanceled;
        }
    };

    const urgencyStyle = (() => {
        switch (order.urgency) {
            case 'emergency': return { bg: `${theme.urgencyEmergency}15`, text: theme.urgencyEmergency, border: theme.urgencyEmergency };
            case 'urgent': return { bg: `${theme.urgencyUrgent}15`, text: theme.urgencyUrgent, border: theme.urgencyUrgent };
            default: return { bg: `${theme.urgencyPlanned}15`, text: theme.urgencyPlanned, border: theme.urgencyPlanned };
        }
    })();

    const statusColor = getStatusColor();

    // Location logic rewrite:
    // - POOL: Area only
    // - CLAIMED: Area + "Start to see"
    // - STARTED: Full Address
    // - COMPLETED/CONFIRMED: Area only (Master work done/paid, privacy for client)
    const getLocationDisplay = () => {
        if (isPool) return order.area;
        if (isClaimed) return `${order.area} • ${t('cardStartToSeeAddress')}`;
        if (isStarted) return order.full_address || order.area;
        return order.area; // Completed/Confirmed -> hide specific address
    };

    // Client info logic:
    // - Only visible if STARTED.
    // - COMPLETED/CONFIRMED should hide client details for privacy after job is done.
    const showClientInfo = isStarted;

    // Grid sizing
    const cardMargin = 6;
    const containerPadding = 16;
    const totalGaps = (columns - 1) * (cardMargin * 2);
    const availableWidth = width - (containerPadding * 2) - totalGaps;
    const cardWidth = columns === 1 ? '100%' : (availableWidth / columns) - cardMargin;

    return (
        <View style={[
            styles.orderCard,
            {
                backgroundColor: theme.bgCard,
                borderColor: isHighlighted ? theme.accentIndigo : theme.borderPrimary,
                borderWidth: isHighlighted ? 2 : 1,
                width: cardWidth,
                opacity: isConfirmed ? 0.6 : 1,
                transform: [{ scale: isHighlighted ? 1.02 : 1 }],
            }
        ]}>
            <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />

            <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.serviceType, { color: theme.textPrimary, fontSize: isHighlighted ? 16 : 15 }]} numberOfLines={1}>
                        {order.service_type}
                    </Text>
                    <Text style={[styles.cardPrice, { color: theme.accentSuccess, fontSize: isHighlighted ? 16 : 15 }]}>
                        {order.final_price
                            ? `${order.final_price}${t('currencySom')}`
                            : order.initial_price
                                ? `${order.initial_price}${t('currencySom')}`
                                : `${order.guaranteed_payout}${t('currencySom')}${t('priceBase')}`}
                    </Text>
                </View>

                <View style={styles.cardMeta}>
                    <View style={[
                        styles.urgencyBadge,
                        {
                            backgroundColor: isPool ? urgencyStyle.bg : `${statusColor}15`,
                            borderColor: isPool ? urgencyStyle.border : statusColor,
                        }
                    ]}>
                        <Text style={[styles.urgencyText, { color: isPool ? urgencyStyle.text : statusColor }]}>
                            {isPool ? t(`urgency${order.urgency.charAt(0).toUpperCase() + order.urgency.slice(1)}`) : t(`status${order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/_/g, '')}`)}
                        </Text>
                    </View>
                    <Text style={[styles.separator, { color: theme.borderSecondary }]}>|</Text>
                    <View style={styles.locationContainer}>
                        <MapPin size={10} color={theme.textMuted} style={{ marginRight: 2 }} />
                        <Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>
                            {getLocationDisplay()}
                        </Text>
                    </View>
                </View>

                <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>
                    {order.problem_description}
                </Text>

                {showClientInfo && order.client && (
                    <View style={[styles.clientInfo, { borderTopColor: theme.borderLight }]}>
                        <View style={styles.clientRow}>
                            <User size={12} color={theme.textMuted} />
                            <Text style={[styles.clientLabel, { color: theme.textMuted }]}>
                                {order.client.full_name}
                            </Text>
                        </View>
                        <View style={styles.clientRow}>
                            <Phone size={12} color={theme.accentPrimary} />
                            <Text style={[styles.clientPhone, { color: theme.accentPrimary }]}>
                                {order.client.phone}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Actions */}
                {!isConfirmed && (
                    <View style={styles.cardActions}>
                        {isPool && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: userVerified ? theme.accentIndigo : theme.borderSecondary }]}
                                disabled={!userVerified || actionLoading}
                                onPress={() => onClaim?.(order.id)}
                            >
                                {userVerified ? (
                                    actionLoading ? <ActivityIndicator size="small" color="#fff" /> :
                                        <View style={styles.btnContent}>
                                            <Briefcase size={12} color="#fff" />
                                            <Text style={styles.actionButtonText}>{t('actionClaim')}</Text>
                                        </View>
                                ) : (
                                    <View style={styles.btnContent}>
                                        <Text style={styles.actionButtonText}>{t('actionLocked')}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}

                        {isClaimed && (
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: theme.accentIndigo }]}
                                disabled={actionLoading}
                                onPress={() => onStart?.(order.id)}
                            >
                                <View style={styles.btnContent}>
                                    <CheckCircle2 size={12} color="#fff" />
                                    <Text style={styles.actionButtonText}>{t('actionStart')}</Text>
                                </View>
                            </TouchableOpacity>
                        )}

                        {isStarted && (
                            <View style={styles.actionRow}>
                                <TouchableOpacity
                                    style={[styles.outlineButton, { borderColor: theme.accentDanger }]}
                                    onPress={() => onRefuse?.(order)}
                                >
                                    <Text style={[styles.outlineButtonText, { color: theme.accentDanger }]}>
                                        {t('actionCancel')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, { backgroundColor: theme.accentSuccess, flex: 1 }]}
                                    onPress={() => onComplete?.(order)}
                                >
                                    <View style={styles.btnContent}>
                                        <Check size={12} color="#fff" />
                                        <Text style={styles.actionButtonText}>{t('actionComplete')}</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}

                        {isCompleted && (
                            <View style={[styles.pendingBadge, { backgroundColor: theme.bgCard }]}>
                                <Clock size={12} color={theme.textMuted} style={{ marginRight: 4 }} />
                                <Text style={[styles.pendingText, { color: theme.textMuted }]}>
                                    {t('cardPendingApproval')}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
};

// ============================================
// FINANCES TAB
// ============================================
const FinancesTab = ({ financials, earnings, refreshing, onRefresh }) => {
    const { t } = useLocalization();
    const { theme } = useTheme();
    const [period, setPeriod] = useState('all'); // yesterday, today, week, month, all, custom
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [dateType, setDateType] = useState('start'); // 'start' or 'end'
    const [customRange, setCustomRange] = useState({ start: new Date(), end: new Date() });

    // Filter earnings by period
    const filteredEarnings = useMemo(() => {
        if (period === 'all') return earnings;
        const now = new Date();
        const cutOff = new Date();

        if (period === 'custom') {
            const start = new Date(customRange.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customRange.end);
            end.setHours(23, 59, 59, 999);

            return earnings.filter(e => {
                const date = new Date(e.created_at || e.date);
                return date >= start && date <= end;
            });
        }

        if (period === 'today') {
            cutOff.setHours(0, 0, 0, 0);
        } else if (period === 'week') {
            cutOff.setDate(now.getDate() - 7);
        } else if (period === 'month') {
            cutOff.setMonth(now.getMonth() - 1);
        }

        return earnings.filter(e => new Date(e.created_at || e.date) >= cutOff);
    }, [period, earnings, customRange]);

    // Calculate stats from filtered earnings
    const stats = useMemo(() => {
        let totalEarnings = 0;
        let commissionOwed = 0;
        let commissionPaid = 0;
        const jobsDone = filteredEarnings.length;

        filteredEarnings.forEach(e => {
            totalEarnings += Number(e.amount) || 0;
            if (e.status === 'pending') {
                commissionOwed += Number(e.commission_amount) || 0;
            } else if (e.status === 'paid') {
                commissionPaid += Number(e.commission_amount) || 0;
            }
        });

        const netBalance = totalEarnings - commissionPaid - commissionOwed;

        return { totalEarnings, commissionOwed, commissionPaid, jobsDone, netBalance };
    }, [filteredEarnings]);

    const handleDateChange = (event, selectedDate) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setCustomRange(prev => ({ ...prev, [dateType]: selectedDate }));
            if (period !== 'custom') setPeriod('custom');
        }
    };

    const openDatePicker = (type) => {
        setDateType(type);
        setShowDatePicker(true);
    };

    const StatCard = ({ label, value, color, icon: Icon, isMain }) => (
        <View style={[
            isMain ? styles.mainStatCard : styles.statCard,
            { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }
        ]}>
            <View style={isMain ? styles.mainStatHeader : styles.statHeader}>
                <Icon size={isMain ? 20 : 14} color={color} />
                <Text style={[isMain ? styles.mainStatLabel : styles.statLabel, { color }]}>{label}</Text>
            </View>
            <Text style={[isMain ? styles.mainStatValue : styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.financesContainer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentPrimary} />}>
            <View style={styles.periodFilterContainer}>
                {['all', 'month', 'week', 'today', 'custom'].map(p => (
                    <TouchableOpacity
                        key={p}
                        style={[
                            styles.periodChip,
                            {
                                backgroundColor: period === p ? `${theme.accentIndigo}15` : theme.bgCard,
                                borderColor: period === p ? theme.accentIndigo : theme.borderPrimary
                            }
                        ]}
                        onPress={() => setPeriod(p)}
                    >
                        <Text style={[styles.periodText, { color: period === p ? theme.accentIndigo : theme.textSecondary }]}>
                            {p === 'all' ? t('filterAll') :
                                p === 'today' ? t('periodToday') :
                                    p === 'week' ? t('periodWeek') :
                                        p === 'month' ? t('periodMonth') :
                                            t('filterCustom')}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {period === 'custom' && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <TouchableOpacity onPress={() => openDatePicker('start')} style={[styles.outlineButton, { borderColor: theme.borderSecondary }]}>
                        <Text style={[styles.outlineButtonText, { color: theme.textPrimary }]}>{t('labelStartDate')}: {customRange.start.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openDatePicker('end')} style={[styles.outlineButton, { borderColor: theme.borderSecondary }]}>
                        <Text style={[styles.outlineButtonText, { color: theme.textPrimary }]}>{t('labelEndDate')}: {customRange.end.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {showDatePicker && (
                <DateTimePicker
                    value={customRange[dateType]}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                />
            )}

            <StatCard
                label={t('finNetBalance')}
                value={stats.netBalance.toFixed(0)}
                color={theme.accentIndigo}
                icon={DollarSign}
                isMain={true}
            />

            <View style={styles.statsGrid}>
                <StatCard label={t('finTotalEarned')} value={stats.totalEarnings.toFixed(0)} color={theme.accentSuccess} icon={Wallet} />
                <StatCard label={t('finCommissionPaid')} value={stats.commissionPaid.toFixed(0)} color={theme.accentIndigo} icon={TrendingUp} />
                <StatCard label={t('finCommissionOwed')} value={stats.commissionOwed.toFixed(0)} color={theme.accentWarning} icon={AlertCircle} />
                <StatCard label={t('finJobsDone')} value={stats.jobsDone} color={theme.accentInfo} icon={CheckCircle2} />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{t('finRecentHistory')}</Text>

            {filteredEarnings.length === 0 ? (
                <View style={[styles.noEarnings, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                    <Text style={[styles.noEarningsText, { color: theme.textMuted }]}>{t('finNoRecords')}</Text>
                </View>
            ) : (
                <View style={[styles.earningsList, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                    {filteredEarnings.map((earning, index) => {
                        const date = new Date(earning.created_at || earning.date);
                        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                        return (
                            <View key={earning.id || index} style={[styles.earningItem, index < filteredEarnings.length - 1 && { borderBottomColor: theme.borderLight, borderBottomWidth: 1 }]}>
                                <View style={styles.earningLeft}>
                                    <Text style={[styles.earningService, { color: theme.textPrimary }]}>{earning.order?.service_type || 'Service'}</Text>
                                    <Text style={[styles.earningArea, { color: theme.textMuted }]}>{earning.order?.area}</Text>
                                    <Text style={[styles.earningDate, { color: theme.textMuted, fontSize: 11, marginTop: 2 }]}>{dateStr}</Text>
                                </View>
                                <View style={styles.earningRight}>
                                    <Text style={[styles.earningAmount, { color: theme.accentSuccess }]}>+{Number(earning.amount).toFixed(0)}</Text>
                                    <Text style={[styles.earningStatus, { color: earning.status === 'paid' ? theme.accentIndigo : theme.accentWarning }]}>
                                        {earning.status === 'paid' ? t('finPaid') : t('finPending')} ({Number(earning.commission_amount).toFixed(0)})
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

// ============================================
// MAIN DASHBOARD CONTENT
// ============================================
const DashboardContent = ({ navigation, route }) => {
    const { t } = useLocalization();
    const { theme, toggleTheme } = useTheme();
    const { cycleLanguage } = useLocalization();
    const { showToast } = useToast();

    const [user, setUser] = useState(route?.params?.user || null);
    const [activeTab, setActiveTab] = useState('pool');
    const [availableOrders, setAvailableOrders] = useState([]);
    const [orderPoolMeta, setOrderPoolMeta] = useState([]); // All pool orders (lightweight) for filters
    const [myOrders, setMyOrders] = useState([]);
    const [financials, setFinancials] = useState(null);
    const [earnings, setEarnings] = useState([]);

    // Pagination State
    const [pagePool, setPagePool] = useState(1);
    const [pageJobs, setPageJobs] = useState(1);
    const [totalPool, setTotalPool] = useState(0);
    const [totalJobs, setTotalJobs] = useState(0);
    const PAGE_LIMIT = 5; // Updated per user request

    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [highlightedOrderId, setHighlightedOrderId] = useState(null);

    const [filters, setFilters] = useState({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' });
    const [modalState, setModalState] = useState({ type: null, order: null }); // type: 'complete' | 'refuse' | null

    const [completeData, setCompleteData] = useState({});
    const [refuseData, setRefuseData] = useState({});

    // Track filtered count for client-side lists (jobs)
    const [filteredJobsCount, setFilteredJobsCount] = useState(0);

    // Initial load
    useEffect(() => { loadData(); }, []);

    // Reload pool when filters change (Debounce could be added here loop)
    useEffect(() => {
        const reloadPool = async () => {
            setLoading(true);
            setPagePool(1); // Reset to page 1
            try {
                const res = await ordersService.getAvailableOrders(1, PAGE_LIMIT, filters);
                setAvailableOrders(res.data);
                setTotalPool(res.count);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        // Only reload if we have a user (skip initial mount race)
        if (user) {
            reloadPool();
        }
    }, [filters]);

    const loadData = async (reset = true) => {
        if (reset) setLoading(true);
        try {
            const u = await authService.getCurrentUser();
            setUser(u);
            if (u) {
                // Fetch pool (page 1), metadata (ALL), jobs, stats
                const [poolRes, metaRes, jobsRes, fin, earn] = await Promise.all([
                    ordersService.getAvailableOrders(pagePool, PAGE_LIMIT, filters),
                    ordersService.getAvailableOrdersMeta(),
                    ordersService.getMasterOrders(u.id, 1, 100),
                    earningsService.getMasterFinancialSummary(u.id),
                    earningsService.getMasterEarnings(u.id),
                ]);

                setAvailableOrders(poolRes.data);
                setTotalPool(poolRes.count);
                setOrderPoolMeta(metaRes);

                setMyOrders(jobsRes.data);
                setTotalJobs(jobsRes.count);

                setFinancials(fin);
                setEarnings(earn);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const changePage = async (tab, page) => {
        if (tab === 'jobs') {
            setPageJobs(page);
            return;
        }

        setLoading(true);
        try {
            const u = user || await authService.getCurrentUser();
            if (!u) return;

            setPagePool(page);
            const res = await ordersService.getAvailableOrders(page, PAGE_LIMIT, filters);
            setAvailableOrders(res.data);
            setTotalPool(res.count);
        } catch (e) {
            console.error('Page change failed', e);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // Sorting Logic for "My Jobs":
    // Active/Incomplete on top.
    // Priority: Started > Claimed > Completed > Confirmed
    const sortJobs = (jobs) => {
        const score = (status) => {
            switch (status) {
                case 'claimed': return 4;
                case 'started': return 3;
                case 'completed': return 2;
                case 'confirmed': return 1;
                default: return 0;
            }
        };
        return [...jobs].sort((a, b) => {
            const scoreDiff = score(b.status) - score(a.status);
            if (scoreDiff !== 0) return scoreDiff;
            return new Date(b.created_at) - new Date(a.created_at); // Newest first within status
        });
    };

    const processedOrders = useMemo(() => {
        // For POOL: active filters are applied SERVER-SIDE. data is already correct page and filtered.
        if (activeTab === 'pool') return availableOrders;

        // For JOBS: Local filter + slice
        let list = sortJobs(myOrders);

        const filtered = list.filter((order) => {
            if (filters.urgency !== 'all' && order.urgency !== filters.urgency) return false;
            if (filters.service !== 'all' && order.service_type !== filters.service) return false;
            if (filters.area !== 'all' && order.area !== filters.area) return false;
            if (filters.pricing !== 'all' && order.pricing_type !== filters.pricing) return false;
            return true;
        });

        // Use a ref or side-effect to update count? 
        // Better: We can't update state during render. 
        // We will calculate total for pagination in render based on this memo if possible, 
        // or just accept we need 2 memos.

        return {
            data: filtered.slice((pageJobs - 1) * PAGE_LIMIT, pageJobs * PAGE_LIMIT),
            total: filtered.length
        };
    }, [activeTab, availableOrders, myOrders, filters, pageJobs]);

    // Update the filtered jobs count state when processedOrders changes (if tab is jobs)
    useEffect(() => {
        if (activeTab === 'jobs') {
            setFilteredJobsCount(processedOrders.total);
        }
    }, [processedOrders, activeTab]);

    const availableServices = useMemo(() => {
        // Collect services from: STANDARD LIST + My Jobs + All Available Pool
        const dynamicServices = [...myOrders, ...orderPoolMeta].map(o => o.service_type);
        const unique = new Set([...STANDARD_SERVICES, ...dynamicServices]);
        return [...unique].filter(Boolean).sort();
    }, [myOrders, orderPoolMeta]);

    const availableAreas = useMemo(() => {
        const combined = [...myOrders, ...orderPoolMeta];
        return [...new Set(combined.map(o => o.area))].filter(Boolean).sort();
    }, [myOrders, orderPoolMeta]);

    // Service Labels with Counts
    const serviceLabels = useMemo(() => {
        const labels = { all: t('filterAll') };

        // Helper to check match against OTHER filters
        const matchesOtherFilters = (order) => {
            if (filters.urgency !== 'all' && order.urgency !== filters.urgency) return false;
            if (filters.area !== 'all' && order.area !== filters.area) return false;
            if (filters.pricing !== 'all' && order.pricing_type !== filters.pricing) return false;
            // Don't check service obviously
            return true;
        };

        const activePool = orderPoolMeta || [];
        const activeJobs = myOrders || [];
        const allCandidates = [...activeJobs, ...activePool];

        availableServices.forEach(s => {
            // Translation
            // Tri-state lookup: 
            // 1. service[Value] (e.g. servicePlumbing)
            // 2. service[CapitalizedValue] (e.g. serviceInstallation)
            // 3. raw value
            const keyStandard = `service${s}`;
            const keyCap = `service${s.charAt(0).toUpperCase() + s.slice(1)}`;

            let translated = s;
            if (t(keyStandard) !== keyStandard) translated = t(keyStandard);
            else if (t(keyCap) !== keyCap) translated = t(keyCap);

            // Count
            // Count unique items (use ID to dedupe if needed, but lists are disjoint - pool vs my jobs)
            const count = allCandidates.filter(o =>
                (o.service_type === s || o.service_type?.toLowerCase() === s.toLowerCase()) &&
                matchesOtherFilters(o)
            ).length;

            labels[s] = `${translated} (${count})`;
        });
        return labels;
    }, [availableServices, orderPoolMeta, myOrders, filters, t]);

    // Update FilterBar prop passing
    // ... we need to pass serviceLabels to FilterBar or let it generate them?
    // The previous implementation generated them inside FilterBar. We should generate them here 
    // where we have access to the counts data, OR pass the counts data to FilterBar.
    // Let's pass the pre-calculated labels. 
    // FilterBar needs update to accept 'serviceLabels' prop instead of generating it.


    // Actions...
    const handleAction = async (fn, ...args) => {
        setActionLoading(true);
        try {
            const res = await fn(...args);
            if (res.success) {
                showToast?.(res.message, 'success');
                setModalState({ type: null, order: null });

                // Specific logic for Claiming code: switch to jobs tab and highlight
                if (fn === ordersService.claimOrder) {
                    const orderId = args[0];
                    setHighlightedOrderId(orderId);
                    setActiveTab('jobs');
                    // Reload data to reflect change, but keep highlight
                    await loadData();
                    // Scroll to top or find item? The list re-renders.
                } else {
                    await loadData();
                }
            } else {
                showToast?.(res.message, 'error');
            }
        } catch (e) {
            showToast?.('Action failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Render...
    return (
        <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
            <Header
                user={user}
                onLogout={() => authService.logoutUser().then(() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }))}
                onLanguageToggle={cycleLanguage}
                onThemeToggle={toggleTheme}
                onRefresh={() => loadData(true)}
            />

            {activeTab !== 'finances' && <FilterBar filters={filters} setFilters={setFilters} availableServices={availableServices} availableAreas={availableAreas} serviceLabels={serviceLabels} />}

            {loading && !refreshing ? (
                <View style={styles.center}><ActivityIndicator color={theme.accentIndigo} size="large" /></View>
            ) : activeTab === 'finances' ? (
                <FinancesTab financials={financials} earnings={earnings} refreshing={refreshing} onRefresh={onRefresh} />
            ) : (
                <FlatList
                    data={activeTab === 'pool' ? processedOrders : processedOrders.data}
                    key={deviceUtils.getGridColumns()}
                    numColumns={deviceUtils.getGridColumns()}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    columnWrapperStyle={deviceUtils.getGridColumns() > 1 ? styles.colWrapper : null}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}
                    renderItem={({ item }) => (
                        <OrderCard
                            order={item}
                            isPool={activeTab === 'pool'}
                            userVerified={user?.is_verified}
                            actionLoading={actionLoading}
                            isHighlighted={item.id === highlightedOrderId}
                            onClaim={() => handleAction(ordersService.claimOrder, item.id, user.id)}
                            onStart={() => handleAction(ordersService.startJob, item.id, user.id)}
                            onComplete={() => setModalState({ type: 'complete', order: item })}
                            onRefuse={() => setModalState({ type: 'refuse', order: item })}
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Inbox size={48} color={theme.textMuted} />
                            <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t(activeTab === 'pool' ? 'emptyPoolTitle' : 'emptyJobsTitle')}</Text>
                        </View>
                    }
                    ListFooterComponent={
                        <Pagination
                            current={activeTab === 'pool' ? pagePool : pageJobs}
                            total={Math.ceil((activeTab === 'pool' ? totalPool : filteredJobsCount) / PAGE_LIMIT)}
                            onPageChange={(p) => changePage(activeTab, p)}
                        />
                    }
                />
            )}

            {/* Bottom Tabs */}
            <View style={[styles.bottomBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.tabBarBorder }]}>
                {[
                    { key: 'pool', label: 'tabPool', icon: LayoutGrid, count: availableOrders.length },
                    { key: 'jobs', label: 'tabJobs', icon: Briefcase, count: myOrders.filter(o => o.status !== 'confirmed').length },
                    { key: 'finances', label: 'tabFinances', icon: Wallet }
                ].map(tab => (
                    <TouchableOpacity key={tab.key} style={styles.tabBtn} onPress={() => setActiveTab(tab.key)}>
                        <View>
                            <tab.icon size={22} color={activeTab === tab.key ? theme.accentIndigo : theme.textSecondary} />
                            {tab.count > 0 && <View style={[styles.badge, { backgroundColor: activeTab === tab.key ? theme.accentIndigo : theme.borderSecondary }]}>
                                <Text style={styles.badgeText}>{tab.count}</Text>
                            </View>}
                        </View>
                        <Text style={[styles.tabLabel, { color: activeTab === tab.key ? theme.accentIndigo : theme.textSecondary }]}>{t(tab.label)}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Complete Job Modal */}
            {modalState.type === 'complete' && modalState.order && (
                <Modal visible={true} transparent animationType="slide" onRequestClose={() => setModalState({ type: null, order: null })}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: theme.bgSecondary }]}>
                            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{t('modalCompleteTitle')}</Text>

                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]}
                                placeholder={t('modalFinalPrice')}
                                placeholderTextColor={theme.textMuted}
                                keyboardType="numeric"
                                value={completeData.finalPrice || ''}
                                onChangeText={(text) => setCompleteData({ ...completeData, finalPrice: text })}
                            />

                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]}
                                placeholder={t('modalWorkPerformed')}
                                placeholderTextColor={theme.textMuted}
                                multiline
                                numberOfLines={3}
                                value={completeData.workPerformed || ''}
                                onChangeText={(text) => setCompleteData({ ...completeData, workPerformed: text })}
                            />

                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary }]}
                                placeholder={t('modalHoursWorked')}
                                placeholderTextColor={theme.textMuted}
                                keyboardType="numeric"
                                value={completeData.hoursWorked || ''}
                                onChangeText={(text) => setCompleteData({ ...completeData, hoursWorked: text })}
                            />

                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.borderSecondary }]}
                                    onPress={() => { setModalState({ type: null, order: null }); setCompleteData({}); }}
                                >
                                    <Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>{t('actionBack')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.accentSuccess, flex: 1 }]}
                                    onPress={() => {
                                        handleAction(
                                            ordersService.completeJob,
                                            modalState.order.id,
                                            user.id,
                                            {
                                                finalPrice: parseFloat(completeData.finalPrice),
                                                workPerformed: completeData.workPerformed,
                                                hoursWorked: parseFloat(completeData.hoursWorked) || null,
                                                priceChangeReason: null
                                            }
                                        );
                                        setCompleteData({});
                                    }}
                                >
                                    <Text style={styles.modalButtonText}>{t('actionSubmit')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Refuse Job Modal */}
            {modalState.type === 'refuse' && modalState.order && (
                <Modal visible={true} transparent animationType="slide" onRequestClose={() => setModalState({ type: null, order: null })}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: theme.bgSecondary }]}>
                            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{t('modalCancelTitle')}</Text>

                            <Text style={[styles.modalLabel, { color: theme.textMuted }]}>{t('modalSelectReason')}</Text>

                            <ScrollView style={styles.reasonsList}>
                                {Object.keys(CANCEL_REASONS_MAP).map((key) => (
                                    <TouchableOpacity
                                        key={key}
                                        style={[
                                            styles.reasonItem,
                                            {
                                                backgroundColor: refuseData.reason === key ? `${theme.accentIndigo}15` : theme.bgCard,
                                                borderColor: refuseData.reason === key ? theme.accentIndigo : theme.borderPrimary
                                            }
                                        ]}
                                        onPress={() => setRefuseData({ ...refuseData, reason: key })}
                                    >
                                        <Text style={[styles.reasonText, { color: refuseData.reason === key ? theme.accentIndigo : theme.textPrimary }]}>
                                            {t(CANCEL_REASONS_MAP[key])}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <TextInput
                                style={[styles.modalInput, { backgroundColor: theme.bgCard, color: theme.textPrimary, borderColor: theme.borderPrimary, marginTop: 10 }]}
                                placeholder={t('modalAdditionalNotes')}
                                placeholderTextColor={theme.textMuted}
                                multiline
                                numberOfLines={2}
                                value={refuseData.notes || ''}
                                onChangeText={(text) => setRefuseData({ ...refuseData, notes: text })}
                            />

                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.borderSecondary }]}
                                    onPress={() => { setModalState({ type: null, order: null }); setRefuseData({}); }}
                                >
                                    <Text style={[styles.modalButtonText, { color: theme.textSecondary }]}>{t('actionBack')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.accentDanger, flex: 1 }]}
                                    onPress={() => {
                                        if (!refuseData.reason) {
                                            showToast?.('Please select a reason', 'error');
                                            return;
                                        }
                                        handleAction(
                                            ordersService.refuseJob,
                                            modalState.order.id,
                                            user.id,
                                            refuseData.reason,
                                            refuseData.notes || null
                                        );
                                        setRefuseData({});
                                    }}
                                    disabled={!refuseData.reason}
                                >
                                    <Text style={styles.modalButtonText}>{t('actionSubmit')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

        </View>
    );
};

export default function MasterDashboard(props) {
    return (
        <ThemeProvider>
            <LocalizationProvider>
                <DashboardContent {...props} />
            </LocalizationProvider>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    userName: { fontSize: 16, fontWeight: '700' },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
    verifiedText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    headerRight: { flexDirection: 'row', gap: 8 },
    headerButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    filterContainer: { borderBottomWidth: 1 },
    filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    filterHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    filterHeaderText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    filterBadge: { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    filterBody: { paddingBottom: 12 },
    filterScroll: { paddingHorizontal: 16, gap: 8 },

    clearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
    clearButtonText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },

    dropdownWrapper: { position: 'relative' },
    dropdownButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 8, borderWidth: 1 },
    dropdownLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    modalOverlay: { flex: 1, backgroundColor: 'transparent' }, // Transparent to feel less like a modal
    dropdownMenu: { position: 'absolute', maxHeight: 250, borderRadius: 8, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: 'hidden' }, // Tighter shadow
    dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    dropdownItemText: { fontSize: 13, fontWeight: '500' },
    checkIcon: { position: 'absolute', left: 10 },

    list: { padding: 16, paddingBottom: 100 },
    colWrapper: { justifyContent: 'space-between' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 400 },
    emptyText: { marginTop: 10, fontSize: 14, fontWeight: '500' },

    orderCard: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden', flexDirection: 'row' },
    statusStripe: { width: 4 },
    cardContent: { flex: 1, padding: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    serviceType: { fontSize: 15, fontWeight: '700', flex: 1 },
    cardPrice: { fontSize: 15, fontWeight: '700' },
    cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    urgencyText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
    separator: { fontSize: 12 },
    locationContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    locationText: { fontSize: 11 },
    description: { fontSize: 12, marginBottom: 10, lineHeight: 18 },
    clientInfo: { paddingTop: 10, borderTopWidth: 1, gap: 4 },
    clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clientLabel: { fontSize: 12 },
    clientPhone: { fontSize: 12, fontWeight: '600' },

    cardActions: { flexDirection: 'row', marginTop: 12, gap: 8 },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    outlineButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    outlineButtonText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
    pendingBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
    pendingText: { fontSize: 11, fontStyle: 'italic' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 24 : 10, paddingTop: 10, borderTopWidth: 1 },
    tabBtn: { flex: 1, alignItems: 'center', gap: 4 },
    tabLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    badge: { position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },

    financesContainer: { padding: 16 },
    periodFilterContainer: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    periodText: { fontSize: 11, fontWeight: '600' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    mainStatCard: { width: '100%', padding: 24, borderRadius: 16, borderWidth: 1, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
    mainStatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    mainStatLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    mainStatValue: { fontSize: 42, fontWeight: '200' },
    statCard: { width: '48%', padding: 16, borderRadius: 12, borderWidth: 1 },
    statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    statValue: { fontSize: 20, fontWeight: '300' },
    sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
    noEarnings: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
    noEarningsText: { fontSize: 13 },
    earningsList: { borderRadius: 12, borderWidth: 1 },
    earningItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
    earningLeft: { gap: 2 },
    earningService: { fontSize: 13, fontWeight: '600' },
    earningArea: { fontSize: 11 },
    earningRight: { alignItems: 'flex-end', gap: 2 },
    earningAmount: { fontSize: 13, fontWeight: '700' },
    earningStatus: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxWidth: 500, borderRadius: 16, padding: 20, maxHeight: '80%' },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
    modalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
    modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    modalButtonText: { color: '#fff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
    reasonsList: { maxHeight: 200, marginBottom: 10 },
    reasonItem: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
    reasonText: { fontSize: 13, fontWeight: '500' },
    // Pagination
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
        paddingBottom: 40,
        gap: 8,
    },
    pageBtn: {
        minWidth: 36,
        height: 36,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
