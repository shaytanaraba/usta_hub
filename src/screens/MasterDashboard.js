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
    View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
    Modal, TextInput, ScrollView, ActivityIndicator, Platform, Dimensions, Pressable, Clipboard, Linking, Animated, Easing, PanResponder,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    LogOut, ShieldCheck, Moon, Sun, MapPin, Check, X, Filter, ChevronDown, ChevronUp,
    Inbox, ClipboardList, AlertCircle, CheckCircle2, Phone, User, Clock, Copy,
    DollarSign, RotateCw, Wallet, CreditCard
} from 'lucide-react-native';

import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import { useToast } from '../contexts/ToastContext';
import { useLocalization, LocalizationProvider } from '../contexts/LocalizationContext';
import { useTheme, ThemeProvider } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import deviceUtils from '../utils/device';
import { getOrderStatusLabel, getServiceLabel } from '../utils/orderHelpers';

const LOG_PREFIX = '[MasterDashboard]';
const PAGE_LIMIT = 5;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const sanitizeNumberInput = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 1) return cleaned;
    return `${parts.shift()}.${parts.join('')}`;
};

// ============================================
// DROPDOWN COMPONENT
// ============================================
const Dropdown = ({ label, value, options, optionLabels = {}, onChange }) => {
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
        } else setIsOpen(false);
    };

    return (
        <View style={styles.dropdownWrapper}>
            <TouchableOpacity ref={buttonRef} style={[styles.dropdownButton, {
                backgroundColor: isActive ? `${theme.accentIndigo}15` : theme.bgCard,
                borderColor: isActive ? theme.accentIndigo : theme.borderPrimary,
            }]} onPress={toggleDropdown}>
                <Text style={[styles.dropdownLabel, { color: isActive ? theme.accentIndigo : theme.textSecondary }]}>
                    {value === 'all' ? label : (optionLabels[value] || value)}
                </Text>
                <ChevronDown size={14} color={isActive ? theme.accentIndigo : theme.textMuted} />
            </TouchableOpacity>
            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <Pressable style={styles.dropdownOverlay} onPress={() => setIsOpen(false)}>
                    <View style={[styles.dropdownMenu, { top: position.top, left: position.left, width: position.width, backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                        <ScrollView style={{ maxHeight: 250 }}>
                            {options.map((opt) => (
                                <TouchableOpacity key={opt} style={[styles.dropdownItem, value === opt && { backgroundColor: `${theme.accentIndigo}15` }]}
                                    onPress={() => { onChange(opt); setIsOpen(false); }}>
                                    <View style={styles.checkIconWrapper}>
                                        {value === opt && <Check size={14} color={theme.accentIndigo} />}
                                    </View>
                                    <Text style={[styles.dropdownItemText, { color: value === opt ? theme.accentIndigo : theme.textPrimary }]}>
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
const Header = ({ user, financials, onLogout, onLanguageToggle, onThemeToggle, onRefresh }) => {
    const { language } = useLocalization();
    const { theme, isDark } = useTheme();
    const getFlagEmoji = () => ({ ru: '🇷🇺', kg: '🇰🇬' }[language] || '🇬🇧');

    return (
        <View style={[styles.header, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}>
            <View style={styles.headerLeft}>
                {user ? (
                    <>
                        {/* User name and balance mini badge */}
                        <Text style={[styles.userName, { color: theme.textPrimary }]} numberOfLines={1}>{user.full_name || 'Master'}</Text>
                        {financials && (
                            <View style={[styles.balanceMini, { backgroundColor: financials.balanceBlocked ? `${theme.accentDanger}15` : `${theme.accentIndigo}15` }]}>
                                <Wallet size={12} color={financials.balanceBlocked ? theme.accentDanger : theme.accentIndigo} />
                                <Text style={{ color: financials.balanceBlocked ? theme.accentDanger : theme.accentIndigo, fontSize: 11, fontWeight: '600' }}>
                                    {financials.prepaidBalance?.toFixed(0) || 0}
                                </Text>
                            </View>
                        )}
                    </>
                ) : <View style={[styles.skeletonName, { backgroundColor: theme.borderSecondary }]} />}
            </View>
            <View style={styles.headerRight}>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onRefresh}><RotateCw size={18} color={theme.accentIndigo} /></TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onLanguageToggle}><Text style={{ fontSize: 16 }}>{getFlagEmoji()}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onThemeToggle}>{isDark ? <Sun size={18} color="#FFD700" /> : <Moon size={18} color={theme.accentIndigo} />}</TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: `${theme.accentDanger}15` }]} onPress={onLogout}><LogOut size={18} color={theme.accentDanger} /></TouchableOpacity>
            </View>
        </View>
    );
};

// ============================================
// ORDER CARD COMPONENT
// ============================================
const OrderCard = ({ order, isPool, userVerified, userBalanceBlocked, actionLoading, onClaim, onStart, onComplete, onRefuse, onCopyAddress, onOpen }) => {
    const { t } = useLocalization();
    const { theme } = useTheme();
    const { width } = Dimensions.get('window');
    const columns = deviceUtils.getGridColumns();

    const isConfirmed = order.status === 'confirmed';
    const isStarted = order.status === 'started';
    const isClaimed = order.status === 'claimed';
    const isCompleted = order.status === 'completed';


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

    const getLocationDisplay = () => {
        if (isPool) return order.area;
        if (isClaimed) return `${order.area} - ${t('cardStartToSeeAddress')}`;
        if (isStarted) return order.area || order.full_address;
        return order.area;
    };

    const addressText = order.full_address || order.address || order.area;
    const showAddressCopy = Boolean(isStarted && addressText);
    const showClientInfo = isStarted;
    const userCanClaim = userVerified && !userBalanceBlocked;
    const cardMargin = 6;
    const containerPadding = 16;
    const totalGaps = (columns - 1) * (cardMargin * 2);
    const availableWidth = width - (containerPadding * 2) - totalGaps;
    const cardWidth = columns === 1 ? '100%' : (availableWidth / columns) - cardMargin;

    return (
        <TouchableOpacity
            activeOpacity={isPool ? 1 : 0.8}
            onPress={() => (!isPool ? onOpen?.(order) : null)}
            style={[styles.orderCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary, width: cardWidth, opacity: isConfirmed ? 0.6 : 1 }]}
        >
            <View style={[styles.statusStripe, { backgroundColor: getStatusColor() }]} />
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
                    <View style={styles.locationContainer}>
                        <MapPin size={10} color={theme.textMuted} />
                        <Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>{getLocationDisplay()}</Text>
                    </View>
                </View>
                <Text style={[styles.description, { color: theme.textSecondary }]} numberOfLines={2}>{order.problem_description}</Text>
                {showAddressCopy && (
                    <View style={styles.addressRow}>
                        <View style={styles.addressTextRow}>
                            <MapPin size={12} color={theme.textMuted} />
                            <Text style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={2}>
                                {addressText}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.copyAddressBtn, { borderColor: theme.accentIndigo, backgroundColor: `${theme.accentIndigo}15` }]}
                            onPress={() => onCopyAddress?.(addressText)}
                        >
                            <Text style={[styles.copyAddressText, { color: theme.accentIndigo }]}>
                                {t('actionCopyAddress') || 'Copy address'}
                            </Text>
                        </TouchableOpacity>
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
                        {isPool && (
                            <TouchableOpacity style={[styles.actionButton, { backgroundColor: userCanClaim ? theme.accentIndigo : theme.borderSecondary }]}
                                disabled={!userCanClaim || actionLoading} onPress={() => onClaim?.(order.id)}>
                                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> :
                                    <Text style={styles.actionButtonText}>{userCanClaim ? t('actionClaim') : t('actionLocked')}</Text>}
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

// ============================================
// SECTION TOGGLE COMPONENT
// ============================================
const SectionToggle = ({ sections, activeSection, onSectionChange }) => {
    const { theme } = useTheme();
    return (
        <View style={[styles.sectionToggle, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}>
            {sections.map(sec => (
                <TouchableOpacity
                    key={sec.key}
                    style={[styles.sectionBtn, activeSection === sec.key && { borderBottomColor: theme.accentIndigo, borderBottomWidth: 2 }]}
                    onPress={() => onSectionChange(sec.key)}
                >
                    <Text style={[styles.sectionBtnText, { color: activeSection === sec.key ? theme.accentIndigo : theme.textSecondary }]}>
                        {sec.label} {sec.count !== undefined && `(${sec.count})`}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

// ============================================
// MY ACCOUNT TAB
// ============================================
const MyAccountTab = ({ user, financials, earnings, orderHistory, balanceTransactions = [], refreshing, onRefresh }) => {
    const { t, language } = useLocalization();
    const { theme } = useTheme();
    const [section, setSection] = useState('history');
    const [period, setPeriod] = useState('all');

    const filteredEarnings = useMemo(() => {
        if (period === 'all') return earnings;
        const now = new Date();
        const cutOff = new Date();
        if (period === 'today') cutOff.setHours(0, 0, 0, 0);
        else if (period === 'week') cutOff.setDate(now.getDate() - 7);
        else if (period === 'month') cutOff.setMonth(now.getMonth() - 1);
        return earnings.filter(e => new Date(e.created_at) >= cutOff);
    }, [period, earnings]);

    const stats = useMemo(() => {
        let totalEarnings = 0, commissionOwed = 0, commissionPaid = 0;
        filteredEarnings.forEach(e => {
            totalEarnings += Number(e.amount) || 0;
            if (e.status === 'pending') commissionOwed += Number(e.commission_amount) || 0;
            else if (e.status === 'paid') commissionPaid += Number(e.commission_amount) || 0;
        });
        return { totalEarnings, commissionOwed, commissionPaid, jobsDone: filteredEarnings.length, netBalance: totalEarnings - commissionPaid - commissionOwed };
    }, [filteredEarnings]);

    const getStatusColor = (status) => ({ confirmed: theme.accentSuccess, completed: theme.statusCompleted, canceled_by_master: theme.accentDanger, canceled_by_client: theme.accentWarning }[status] || theme.textMuted);

    const getStatusLabel = (status) => getOrderStatusLabel(status, t);

    const StatCard = ({ label, value, color, icon: Icon, small }) => (
        <View style={[small ? styles.statCardSmall : styles.statCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
            <View style={styles.statHeader}><Icon size={small ? 14 : 18} color={color} /><Text style={[styles.statLabel, { color }]}>{label}</Text></View>
            <Text style={[small ? styles.statValueSmall : styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.accountContainer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}>
            {/* Balance Card */}
            <View style={[styles.balanceCard, { backgroundColor: theme.bgCard, borderColor: financials?.balanceBlocked ? theme.accentDanger : theme.borderPrimary }]}>
                <View style={styles.balanceHeader}><Wallet size={20} color={theme.accentIndigo} /><Text style={[styles.balanceLabel, { color: theme.textMuted }]}>{t('prepaidBalance')}</Text></View>
                <Text style={[styles.balanceValue, { color: financials?.balanceBlocked ? theme.accentDanger : theme.textPrimary }]}>{financials?.prepaidBalance?.toFixed(0) || 0}</Text>
                {financials?.balanceBlocked && <View style={[styles.blockedBadge, { backgroundColor: `${theme.accentDanger}20` }]}><AlertCircle size={12} color={theme.accentDanger} /><Text style={{ color: theme.accentDanger, fontSize: 11 }}>{t('balanceBlocked')}</Text></View>}
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>{t('initialDeposit')}: {financials?.initialDeposit || 0} | {t('threshold')}: {financials?.balanceThreshold || 0}</Text>
            </View>

            {/* Section Tabs - Earnings hidden temporarily */}
            <View style={[styles.accountSectionTabs, { borderBottomColor: theme.borderPrimary }]}>
                {[{ key: 'history', icon: ClipboardList, label: t('sectionHistory') }, { key: 'profile', icon: User, label: t('sectionProfile') }].map(s => (
                    <TouchableOpacity key={s.key} style={[styles.accountSectionTab, section === s.key && { borderBottomColor: theme.accentIndigo, borderBottomWidth: 2 }]} onPress={() => setSection(s.key)}>
                        <s.icon size={14} color={section === s.key ? theme.accentIndigo : theme.textMuted} />
                        <Text style={{ color: section === s.key ? theme.accentIndigo : theme.textMuted, fontSize: 11, fontWeight: '600' }}>{s.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Earnings Section */}
            {section === 'earnings' && (
                <View style={styles.earningsSection}>
                    <View style={styles.periodFilter}>{['all', 'month', 'week', 'today'].map(p => (
                        <TouchableOpacity key={p} style={[styles.periodChip, { backgroundColor: period === p ? `${theme.accentIndigo}15` : theme.bgCard, borderColor: period === p ? theme.accentIndigo : theme.borderPrimary }]} onPress={() => setPeriod(p)}>
                            <Text style={{ color: period === p ? theme.accentIndigo : theme.textSecondary, fontSize: 11 }}>{t(`period${p.charAt(0).toUpperCase() + p.slice(1)}`)}</Text>
                        </TouchableOpacity>
                    ))}</View>
                    <StatCard label={t('finNetBalance')} value={stats.netBalance.toFixed(0)} color={theme.accentIndigo} icon={DollarSign} />
                    <View style={styles.statsGrid}>
                        <StatCard label={t('finTotalEarned')} value={stats.totalEarnings.toFixed(0)} color={theme.accentSuccess} icon={Wallet} small />
                        <StatCard label={t('finCommissionPaid')} value={stats.commissionPaid.toFixed(0)} color={theme.accentIndigo} icon={CreditCard} small />
                        <StatCard label={t('finCommissionOwed')} value={stats.commissionOwed.toFixed(0)} color={theme.accentWarning} icon={AlertCircle} small />
                        <StatCard label={t('finJobsDone')} value={stats.jobsDone} color={theme.accentInfo} icon={CheckCircle2} small />
                    </View>
                    {filteredEarnings.length > 0 && (
                        <View style={[styles.earningsList, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                            {filteredEarnings.slice(0, 10).map((e, i) => (
                                <View key={e.id || i} style={[styles.earningItem, i < filteredEarnings.length - 1 && { borderBottomColor: theme.borderLight, borderBottomWidth: 1 }]}>
                                    <View><Text style={[styles.earningService, { color: theme.textPrimary }]}>{e.order?.service_type || 'Service'}</Text><Text style={{ color: theme.textMuted, fontSize: 10 }}>{new Date(e.created_at).toLocaleDateString()}</Text></View>
                                    <View style={{ alignItems: 'flex-end' }}><Text style={{ color: theme.accentSuccess, fontWeight: '600' }}>+{Number(e.amount).toFixed(0)}</Text><Text style={{ color: e.status === 'paid' ? theme.accentIndigo : theme.accentWarning, fontSize: 9 }}>{e.status === 'paid' ? t('finPaid') : t('finPending')}</Text></View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {/* History Section - Combined orders and balance transactions */}
            {section === 'history' && (
                <View style={styles.historySection}>
                    {(() => {
                        // Combine and sort order history with balance transactions by date (newest first)
                        const combinedHistory = [
                            ...orderHistory.map(o => ({ ...o, type: 'order', date: new Date(o.created_at) })),
                            ...balanceTransactions.map(tx => ({ ...tx, type: 'transaction', date: new Date(tx.created_at) }))
                        ].sort((a, b) => b.date - a.date);

                        if (combinedHistory.length === 0) {
                            return (
                                <View style={styles.emptyState}>
                                    <ClipboardList size={40} color={theme.textMuted} />
                                    <Text style={{ color: theme.textMuted }}>{t('noOrderHistory')}</Text>
                                </View>
                            );
                        }

                        return combinedHistory.map((item, i) => {
                            // Render balance transaction (top-up, adjustment, etc)
                            if (item.type === 'transaction') {
                                const isPositive = item.amount > 0;
                                const isCommissionTx = String(item.transaction_type || '').includes('commission');
                                const txTypeLabel = {
                                    top_up: t('transactionTopUp') || 'Top Up',
                                    adjustment: t('transactionAdjustment') || 'Adjustment',
                                    refund: t('transactionRefund') || 'Refund',
                                    waiver: t('transactionWaiver') || 'Waiver',
                                    commission: t('transactionCommission') || 'Commission',
                                    commission_deduct: t('transactionCommission') || 'Commission'
                                }[item.transaction_type] || (isCommissionTx ? (t('transactionCommission') || 'Commission') : item.transaction_type);

                                return (
                                    <View key={`tx-${item.id}`} style={[styles.historyItem, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                        <View>
                                        <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{txTypeLabel}</Text>
                                        {item.notes && (
                                            <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
                                                {isCommissionTx
                                                    ? (t('commissionClue') || 'Commission from a completed job')
                                                    : item.notes}
                                            </Text>
                                        )}
                                            <Text style={{ color: theme.textMuted, fontSize: 10 }}>{item.date.toLocaleDateString()}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ color: isPositive ? theme.accentSuccess : theme.accentDanger, fontWeight: '600' }}>
                                                {isPositive ? '+' : ''}{Number(item.amount).toFixed(0)}
                                            </Text>
                                            <Text style={{ color: theme.textMuted, fontSize: 9 }}>{item.balance_after?.toFixed(0) || '-'}</Text>
                                        </View>
                                    </View>
                                );
                            }

                            // Render order history item with commission info
                            const o = item;
                            return (
                                <View key={o.id} style={[styles.historyItem, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                                    <View>
                                        <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{getServiceLabel(o.service_type, t)}</Text>
                                        <Text style={{ color: theme.textMuted, fontSize: 11 }}>{o.area}</Text>
                                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>{o.date.toLocaleDateString()}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: theme.accentSuccess, fontWeight: '600' }}>
                                            {o.final_price ?? o.initial_price ?? o.callout_fee ?? '-'}
                                        </Text>
                                        {/* Show commission if available */}
                                        {o.commission_amount && <Text style={{ color: theme.textMuted, fontSize: 9 }}>-{o.commission_amount} {t('transactionCommission') || 'comm.'}</Text>}
                                        <View style={[styles.statusBadgeSmall, { backgroundColor: `${getStatusColor(o.status)}20` }]}>
                                            <Text style={{ color: getStatusColor(o.status), fontSize: 9 }}>{getStatusLabel(o.status)}</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        });
                    })()}
                </View>
            )}

            {/* Profile Section */}
            {section === 'profile' && (
                <View style={styles.profileSection}>
                    {/* User info card with verified status */}
                    <View style={[styles.profileCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                        <View style={styles.profileHeaderRow}>
                            <Text style={[styles.profileName, { color: theme.textPrimary }]}>{financials?.fullName || user?.full_name}</Text>
                            {/* Verified badge - moved from header */}
                            <View style={[styles.verifiedBadgeProfile, {
                                backgroundColor: user?.is_verified ? `${theme.accentSuccess}20` : `${theme.accentDanger}20`,
                                borderColor: user?.is_verified ? theme.accentSuccess : theme.accentDanger
                            }]}>
                                {user?.is_verified ? <ShieldCheck size={12} color={theme.accentSuccess} /> : <AlertCircle size={12} color={theme.accentDanger} />}
                                <Text style={{ color: user?.is_verified ? theme.accentSuccess : theme.accentDanger, fontSize: 10, fontWeight: '600' }}>
                                    {t(user?.is_verified ? 'verified' : 'unverified')}
                                </Text>
                            </View>
                        </View>
                        <Text style={{ color: theme.textMuted, marginTop: 4 }}>{financials?.email || user?.email}</Text>
                        <Text style={{ color: theme.textSecondary }}>{financials?.phone || user?.phone}</Text>
                    </View>

                    {/* Professional info card */}
                    <View style={[styles.profileCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                        <Text style={{ color: theme.textPrimary, fontWeight: '600', marginBottom: 8 }}>{t('professionalInfo')}</Text>
                        <View style={styles.infoRow}><Text style={{ color: theme.textMuted }}>{t('serviceArea')}:</Text><Text style={{ color: theme.textPrimary }}>{financials?.serviceArea || '-'}</Text></View>
                        <View style={styles.infoRow}><Text style={{ color: theme.textMuted }}>{t('license')}:</Text><Text style={{ color: theme.textPrimary }}>{financials?.licenseNumber || '-'}</Text></View>
                        <View style={styles.infoRow}><Text style={{ color: theme.textMuted }}>{t('experience')}:</Text><Text style={{ color: theme.textPrimary }}>{financials?.experienceYears || 0} {t('years')}</Text></View>
                        <View style={styles.infoRow}><Text style={{ color: theme.textMuted }}>{t('specializations')}:</Text><Text style={{ color: theme.textPrimary }}>{financials?.specializations?.join(', ') || '-'}</Text></View>
                    </View>
                </View>
            )}
            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

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

    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('orders');
    const [orderSection, setOrderSection] = useState('available');
    const [availableOrders, setAvailableOrders] = useState([]);
    const [myOrders, setMyOrders] = useState([]);
    const [financials, setFinancials] = useState(null);
    const [earnings, setEarnings] = useState([]);
    const [orderHistory, setOrderHistory] = useState([]);
    // Balance transactions for showing admin top-ups in History
    const [balanceTransactions, setBalanceTransactions] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [cancelReasons, setCancelReasons] = useState([]);

    const [pagePool, setPagePool] = useState(1);
    const [totalPool, setTotalPool] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [filters, setFilters] = useState({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' });
    const [showFilters, setShowFilters] = useState(true);
    const [modalState, setModalState] = useState({ type: null, order: null });
    const [completeData, setCompleteData] = useState({});
    const [refuseData, setRefuseData] = useState({});
    const [activeSheetOrder, setActiveSheetOrder] = useState(null);
    const [sheetSnap, setSheetSnap] = useState('full'); // 'peek' | 'half' | 'full'
    const [sheetModalVisible, setSheetModalVisible] = useState(false);
    const sheetAnim = useRef(new Animated.Value(0)).current;
    const sheetSnapAnim = useRef(new Animated.Value(0)).current;

    const { logout } = useAuth();

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if (user) reloadPool(); }, [filters]);
    useEffect(() => {
        if (activeTab !== 'orders') return;
        if (activeSheetOrder) return;
        const active = myOrders.find(o => o.status === ORDER_STATUS.STARTED || o.status === ORDER_STATUS.CLAIMED);
        if (active) {
            setActiveSheetOrder(active);
            setSheetSnap('full');
        }
    }, [activeTab, myOrders, activeSheetOrder]);

    useEffect(() => {
        if (activeSheetOrder && sheetSnap !== 'peek') {
            setSheetModalVisible(true);
            Animated.timing(sheetAnim, {
                toValue: 1,
                duration: 240,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
            return;
        }
        if (sheetModalVisible) {
            Animated.timing(sheetAnim, {
                toValue: 0,
                duration: 180,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
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
            useNativeDriver: true,
        }).start();
    }, [sheetSnap, sheetSnapAnim]);

    useEffect(() => {
        if (!activeSheetOrder) return;
        const updated = myOrders.find(o => o.id === activeSheetOrder.id);
        if (!updated) return;
        if (updated.status !== activeSheetOrder.status) {
            if (['completed', 'confirmed', 'canceled_by_master', 'canceled_by_client', 'expired'].includes(updated.status)) {
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

    const loadData = async (reset = true) => {
        if (reset) setLoading(true);
        try {
            const u = await authService.getCurrentUser();
            setUser(u);
            if (u) {
                const [poolRes, jobsRes, fin, earn, hist, balTx, svcTypes, reasons] = await Promise.all([
                    ordersService.getAvailableOrders(1, PAGE_LIMIT, filters),
                    ordersService.getMasterOrders(u.id, 1, 100),
                    earningsService.getMasterFinancialSummary(u.id),
                    earningsService.getMasterEarnings(u.id),
                    ordersService.getMasterOrderHistory(u.id),
                    earningsService.getBalanceTransactions(u.id),  // Fetch balance transactions (top-ups)
                    ordersService.getServiceTypes(),
                    ordersService.getCancellationReasons('master'),
                ]);
                setAvailableOrders(poolRes.data); setTotalPool(poolRes.count);
                setMyOrders(jobsRes.data); setFinancials(fin); setEarnings(earn);
                setOrderHistory(hist); setBalanceTransactions(balTx);
                setServiceTypes(svcTypes); setCancelReasons(reasons);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const reloadPool = async () => {
        try {
            setPagePool(1);
            const res = await ordersService.getAvailableOrders(1, PAGE_LIMIT, filters);
            setAvailableOrders(res.data); setTotalPool(res.count);
        } catch (e) { console.error(e); }
    };

    const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

    const handleLogout = async () => {
        try {
            await logout({ scope: 'local' });
        } catch (e) {
            console.error('Logout failed', e);
        } finally {
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
    };

    const processedOrders = useMemo(() => {
        const isHistoryStatus = (status) => (
            status === 'completed'
            || status === 'confirmed'
            || status === 'canceled_by_master'
            || status === 'canceled_by_client'
            || status === 'expired'
        );
        if (orderSection === 'myJobs') {
            return myOrders.filter(o => !isHistoryStatus(o.status));
        }
        return availableOrders.filter(o => {
            if (filters.urgency !== 'all' && o.urgency !== filters.urgency) return false;
            if (filters.service !== 'all' && o.service_type !== filters.service) return false;
            if (filters.area !== 'all' && o.area !== filters.area) return false;
            if (filters.pricing !== 'all' && o.pricing_type !== filters.pricing) return false;
            return true;
        });
    }, [availableOrders, filters, myOrders, orderSection]);

    const activeJobsCount = myOrders.filter(o => !['completed', 'confirmed', 'canceled_by_master', 'canceled_by_client', 'expired'].includes(o.status)).length;
    const sheetAddress = activeSheetOrder?.full_address || activeSheetOrder?.address || '';
    const sheetArea = activeSheetOrder?.area || '';
    const sheetOrientir = activeSheetOrder?.orientir || activeSheetOrder?.landmark || '';
    const sheetClientName = activeSheetOrder?.client_name || activeSheetOrder?.client?.full_name || '';
    const sheetClientPhone = activeSheetOrder?.client_phone || activeSheetOrder?.client?.phone || '';
    const sheetDispatcherName = activeSheetOrder?.dispatcher?.full_name || activeSheetOrder?.dispatcher_name || '';
    const sheetDispatcherPhone = activeSheetOrder?.dispatcher?.phone || activeSheetOrder?.dispatcher_phone || '';
    const sheetCanSeeDetails = activeSheetOrder?.status === ORDER_STATUS.STARTED;
    const screenHeight = Dimensions.get('window').height || 800;
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

    const availableServices = useMemo(() => {
        const codes = serviceTypes.map(s => s.code);
        const dynamic = [...myOrders, ...availableOrders].map(o => o.service_type);
        return [...new Set([...codes, ...dynamic])].filter(Boolean).sort();
    }, [serviceTypes, myOrders, availableOrders]);

    const availableAreas = useMemo(() => [...new Set([...myOrders, ...availableOrders].map(o => o.area))].filter(Boolean).sort(), [myOrders, availableOrders]);

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
        const labels = { all: t('filterAll') };
        availableServices.forEach(svc => {
            labels[svc] = getServiceFilterLabel(svc);
        });
        return labels;
    }, [availableServices, language]);


    const handleClaim = async (orderId) => {
        // Find the order to estimate commission
        const order = availableOrders.find(o => o.id === orderId);
        const priceForCommission = Number(order?.final_price ?? order?.initial_price ?? 0);
        if (priceForCommission > 0) {
            const estimatedCommission = priceForCommission * 0.20; // 20% platform rate on job price only
            const projectedBalance = (financials?.prepaidBalance || 0) - estimatedCommission;

            // Show warning if balance would go negative after commission
            if (projectedBalance < 0 && financials?.prepaidBalance > 0) {
                showToast?.(`Warning: After completing this job, your balance may go negative. Remember to top up!`, 'warning');
            }
        }

        setActionLoading(true);
        const result = await ordersService.claimOrder(orderId);
        if (result.success) {
            showToast?.(result.message, 'success');
            setActiveSheetOrder(order ? { ...order, status: ORDER_STATUS.CLAIMED } : { id: orderId, status: ORDER_STATUS.CLAIMED });
            setSheetSnap('full');
            await loadData();
        } else showToast?.(result.message, 'error');
        setActionLoading(false);
    };

    const handleAction = async (fn, ...args) => {
        setActionLoading(true);
        try {
            const res = await fn(...args);
            if (res.success) {
                showToast?.(res.message, 'success');
                setModalState({ type: null, order: null });
                if (res.order && res.order.id === activeSheetOrder?.id) {
                    setActiveSheetOrder(res.order);
                }
                await loadData();
            }
            else showToast?.(res.message, 'error');
            return res;
        } catch (e) { showToast?.('Action failed', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleCopyAddress = (text) => {
        if (!text) {
            showToast?.(t('toastClipboardEmpty') || 'Nothing to copy', 'info');
            return;
        }
        Clipboard.setString(text);
        showToast?.(t('toastCopied') || 'Copied', 'success');
    };

    const handleCopyPhone = (text) => {
        if (!text) {
            showToast?.(t('toastClipboardEmpty') || 'Nothing to copy', 'info');
            return;
        }
        Clipboard.setString(text);
        showToast?.(t('toastCopied') || 'Copied', 'success');
    };


    const handleOpenOrderSheet = (order) => {
        if (!order) return;
        setActiveSheetOrder(order);
        setSheetSnap('full');
    };

    const handleCloseOrderSheet = () => {
        setSheetSnap('peek');
    };

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
            <Header
                user={user}
                financials={financials}
                onLogout={handleLogout}
                onLanguageToggle={cycleLanguage}
                onThemeToggle={toggleTheme}
                onRefresh={() => loadData(true)}
            />

            {activeTab === 'orders' && (
                <>
                    <SectionToggle
                        sections={[
                            { key: 'available', label: t('sectionAvailable'), count: availableOrders.length },
                            { key: 'myJobs', label: t('sectionMyJobs'), count: activeJobsCount }
                        ]}
                        activeSection={orderSection}
                        onSectionChange={setOrderSection}
                    />
                    {orderSection === 'available' && (
                        <View style={[styles.filterBar, { backgroundColor: theme.bgSecondary, borderBottomColor: theme.borderPrimary }]}>
                            <View style={styles.filterBarRow}>
                                {/* Filter toggle button - left side */}
                                <TouchableOpacity
                                    style={[styles.filterToggleBtn, {
                                        backgroundColor: showFilters ? `${theme.accentIndigo}15` : theme.bgCard,
                                        borderColor: showFilters ? theme.accentIndigo : theme.borderPrimary
                                    }]}
                                    onPress={() => setShowFilters(!showFilters)}
                                >
                                    <Filter size={14} color={showFilters ? theme.accentIndigo : theme.textSecondary} />
                                    {showFilters ? <ChevronUp size={14} color={theme.accentIndigo} /> : <ChevronDown size={14} color={theme.textSecondary} />}
                                </TouchableOpacity>

                                {/* Filter dropdowns - center/scrollable */}
                                {showFilters && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent} style={styles.filterScroll}>
                                        <Dropdown label={t('filterUrgency')} value={filters.urgency} options={['all', 'emergency', 'urgent', 'planned']} optionLabels={{ all: t('filterAll'), emergency: t('urgencyEmergency'), urgent: t('urgencyUrgent'), planned: t('urgencyPlanned') }} onChange={v => setFilters({ ...filters, urgency: v })} />
                                        <Dropdown label={t('filterService')} value={filters.service} options={['all', ...availableServices]} optionLabels={serviceOptionLabels} onChange={v => setFilters({ ...filters, service: v })} />
                                        <Dropdown label={t('filterArea')} value={filters.area} options={['all', ...availableAreas]} optionLabels={{ all: t('filterAll') }} onChange={v => setFilters({ ...filters, area: v })} />
                                    </ScrollView>
                                )}

                                {/* Clear Filters button - right side, only visible when filters are active */}
                                {(filters.urgency !== 'all' || filters.service !== 'all' || filters.area !== 'all' || filters.pricing !== 'all') && (
                                    <TouchableOpacity
                                        style={[styles.clearFiltersBtn, { borderColor: theme.textMuted, marginLeft: 'auto' }]}
                                        onPress={() => setFilters({ urgency: 'all', service: 'all', area: 'all', pricing: 'all' })}
                                    >
                                        <X size={14} color={theme.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}
                </>
            )}

            {loading && !refreshing ? (
                <View style={styles.center}><ActivityIndicator color={theme.accentIndigo} size="large" /></View>
            ) : activeTab === 'account' ? (
                <MyAccountTab
                    user={user}
                    financials={financials}
                    earnings={earnings}
                    orderHistory={orderHistory}
                    balanceTransactions={balanceTransactions}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />
            ) : (
                <FlatList data={processedOrders} key={deviceUtils.getGridColumns()} numColumns={deviceUtils.getGridColumns()} keyExtractor={item => item.id} contentContainerStyle={styles.list}
                    columnWrapperStyle={deviceUtils.getGridColumns() > 1 ? styles.colWrapper : null} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}
                    renderItem={({ item }) => (
                        <OrderCard
                            order={item}
                            isPool={orderSection === 'available'}
                            userVerified={user?.is_verified}
                            userBalanceBlocked={financials?.balanceBlocked}
                            actionLoading={actionLoading}
                            onClaim={handleClaim}
                            onStart={(id) => handleAction(ordersService.startJob, id, user.id)}
                            onCopyAddress={handleCopyAddress}
                            onComplete={(o) => setModalState({ type: 'complete', order: o })}
                            onRefuse={(o) => setModalState({ type: 'refuse', order: o })}
                            onOpen={orderSection === 'myJobs' ? handleOpenOrderSheet : null}
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Inbox size={48} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted, marginTop: 10 }}>
                                {orderSection === 'available'
                                    ? safeT('emptyPoolTitle', 'No available orders')
                                    : safeT('emptyJobsTitle', 'No active jobs')}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Bottom Tabs */}
            <View style={[styles.bottomBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.tabBarBorder }]}>
                <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('orders')}>
                    <ClipboardList size={22} color={activeTab === 'orders' ? theme.accentIndigo : theme.textSecondary} />
                    <Text style={[styles.tabLabel, { color: activeTab === 'orders' ? theme.accentIndigo : theme.textSecondary }]}>{t('tabOrders')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tabBtn} onPress={() => setActiveTab('account')}>
                    <User size={22} color={activeTab === 'account' ? theme.accentIndigo : theme.textSecondary} />
                    <Text style={[styles.tabLabel, { color: activeTab === 'account' ? theme.accentIndigo : theme.textSecondary }]}>{t('tabMyAccount')}</Text>
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
                                    pointerEvents="none"
                                    colors={isDark ? ['#111827', '#0f172a'] : ['#ffffff', '#f1f5f9']}
                                    style={StyleSheet.absoluteFill}
                                />
                                <Pressable style={styles.claimHandle} onPress={() => setSheetSnap(sheetSnap === 'half' ? 'full' : 'half')} />
                                <View style={styles.sheetContent}>
                                    <View style={[styles.sheetBody, { paddingBottom: sheetBodyPaddingBottom }]}>
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
                                            </View>
                                        </View>
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
                                </View>
                                <View style={[styles.sheetFooter, { backgroundColor: theme.bgSecondary, borderTopColor: theme.borderPrimary, paddingBottom: sheetBottomInset }]}>
                                    <View style={styles.sheetFooterActions}>
                                        {activeSheetOrder.status === ORDER_STATUS.CLAIMED && (
                                            <TouchableOpacity
                                                style={[styles.primarySheetButton, { backgroundColor: theme.accentIndigo, shadowColor: theme.accentIndigo, shadowOpacity: 0.35 }]}
                                                disabled={actionLoading}
                                                onPress={() => handleAction(ordersService.startJob, activeSheetOrder.id, user.id)}
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
                                                    onPress={() => setModalState({ type: 'refuse', order: activeSheetOrder })}
                                                >
                                                    <Text style={[styles.secondarySheetButtonText, { color: theme.accentDanger }]}>
                                                        {safeT('actionCancel', 'Cancel')}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[styles.primarySheetButton, { backgroundColor: theme.accentSuccess, shadowColor: theme.accentSuccess, shadowOpacity: 0.35 }]}
                                                    onPress={() => setModalState({ type: 'complete', order: activeSheetOrder })}
                                                >
                                                    <Text style={styles.primarySheetButtonText}>{safeT('actionComplete', 'Complete')}</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </View>
                                </View>
                            </View>
                            </Pressable>
                        </Animated.View>
                    </View>
                </Modal>
            )}
            {activeTab === 'orders' && activeSheetOrder && sheetSnap === 'peek' && !sheetModalVisible && (
                <Pressable
                    style={[styles.sheetPeek, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary, bottom: sheetBottomInset + 8 }]}
                    onPress={() => setSheetSnap('full')}
                >
                    <View style={styles.sheetPeekHandle} />
                    <View style={styles.sheetPeekContent}>
                        <Text style={[styles.sheetPeekLabel, { color: theme.textMuted }]}>{safeT('activeOrderTitle', 'Active order')}</Text>
                        <Text style={[styles.sheetPeekValue, { color: theme.textPrimary }]} numberOfLines={1}>
                            {getServiceLabel(activeSheetOrder.service_type, t)}
                        </Text>
                    </View>
                    <View style={[styles.sheetPeekBadge, { backgroundColor: `${theme.accentIndigo}20` }]}>
                        <Text style={[styles.sheetPeekBadgeText, { color: theme.accentIndigo }]}>{getOrderStatusLabel(activeSheetOrder.status, t)}</Text>
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
                                    if (!refuseData.reason) { showToast?.('Please select a reason', 'error'); return; }
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

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingTop: Platform.OS === 'ios' ? 50 : 40, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    headerRight: { flexDirection: 'row', gap: 8 },
    userName: { fontSize: 15, fontWeight: '700', maxWidth: 100 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 1, gap: 4 },
    verifiedText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    balanceMini: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    headerButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    skeletonName: { width: 80, height: 16, borderRadius: 4 },
    sectionToggle: { flexDirection: 'row', borderBottomWidth: 1 },
    sectionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    sectionBtnText: { fontSize: 13, fontWeight: '600' },
    filterBar: { paddingVertical: 8, borderBottomWidth: 1, paddingHorizontal: 12 },
    filterBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    filterToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 36, borderRadius: 8, borderWidth: 1 },
    filterScroll: { flex: 1 },
    filterScrollContent: { gap: 8 },
    // Clear filters button - outline style with X icon
    clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent' },
    clearFiltersBtnText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
    dropdownWrapper: { position: 'relative' },
    dropdownButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 8, borderWidth: 1 },
    dropdownLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    dropdownOverlay: { flex: 1, backgroundColor: 'transparent' },
    dropdownMenu: { position: 'absolute', borderRadius: 8, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: 'hidden' },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    dropdownItemText: { fontSize: 13, fontWeight: '500' },
    checkIconWrapper: { width: 20, alignItems: 'center', marginRight: 6 },
    list: { padding: 16, paddingBottom: 100 },
    colWrapper: { justifyContent: 'space-between' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
    orderCard: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden', flexDirection: 'row' },
    statusStripe: { width: 4 },
    cardContent: { flex: 1, padding: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    serviceType: { fontSize: 14, fontWeight: '700', flex: 1 },
    cardPrice: { fontSize: 14, fontWeight: '700' },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    urgencyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    urgencyText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
    locationContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    locationText: { fontSize: 11, flex: 1 },
    description: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
    addressRow: { marginBottom: 10, gap: 8 },
    addressTextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    addressText: { fontSize: 12, flex: 1, lineHeight: 16 },
    copyAddressBtn: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
    copyAddressText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    clientInfo: { paddingTop: 10, borderTopWidth: 1, gap: 4 },
    clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clientLabel: { fontSize: 12 },
    clientPhone: { fontSize: 12, fontWeight: '600' },
    cardActions: { marginTop: 12 },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    outlineButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    outlineButtonText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    pendingBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 4 },
    pendingText: { fontSize: 11, fontStyle: 'italic' },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 24 : 10, paddingTop: 10, borderTopWidth: 1 },
    tabBtn: { flex: 1, alignItems: 'center', gap: 4 },
    tabLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    accountContainer: { flex: 1, padding: 16 },
    balanceCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 16, alignItems: 'center' },
    balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    balanceLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    balanceValue: { fontSize: 36, fontWeight: '200' },
    blockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
    accountSectionTabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
    accountSectionTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    earningsSection: {},
    periodFilter: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    statCard: { padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 12, alignItems: 'center' },
    statCardSmall: { width: '48%', padding: 14, borderRadius: 12, borderWidth: 1 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    statValue: { fontSize: 28, fontWeight: '200' },
    statValueSmall: { fontSize: 18, fontWeight: '300' },
    earningsList: { borderRadius: 12, borderWidth: 1 },
    earningItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
    earningService: { fontSize: 13, fontWeight: '600' },
    historySection: { gap: 10 },
    historyItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 10, borderWidth: 1 },
    statusBadgeSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    profileSection: { gap: 16 },
    profileCard: { padding: 16, borderRadius: 12, borderWidth: 1 },
    // Profile header row with name and verified badge
    profileHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    verifiedBadgeProfile: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    profileName: { fontSize: 18, fontWeight: '700' },
    statsRow: { flexDirection: 'row', gap: 10 },
    statItem: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, gap: 4 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxWidth: 500, borderRadius: 16, padding: 20, maxHeight: '80%' },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
    modalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
    modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    modalButtonText: { color: '#fff', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
    reasonItem: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
    claimOverlay: { padding: 0, alignItems: 'stretch', justifyContent: 'flex-end' },
    claimModalContent: {
        width: '100%',
        maxWidth: '100%',
        alignSelf: 'stretch',
        flex: 1,
        maxHeight: '100%',
        padding: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        paddingTop: 6,
        paddingHorizontal: 18,
        paddingBottom: 0
    },
    claimHandle: { alignSelf: 'center', width: 48, height: 5, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.5)', marginBottom: 6 },
    claimScroll: { paddingBottom: 12 },
    claimHeader: { alignItems: 'center', gap: 10, marginBottom: 6 },
    claimHeaderRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 6, position: 'relative' },
    claimHeaderText: { flex: 1, alignItems: 'center' },
    claimCloseBtn: { position: 'absolute', right: 0, top: 0, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    claimCloseText: { fontSize: 18, fontWeight: '700' },
    sheetContent: { flex: 1, position: 'relative', justifyContent: 'flex-start' },
    sheetBody: { flex: 1, gap: 6 },
    sheetHeaderBlock: { marginTop: 16, marginBottom: 20 },
    claimTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
    claimSubtitle: { fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
    claimDetails: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10, marginBottom: 12 },
    claimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    claimLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
    claimValue: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
    claimWarningBox: { marginTop: 6, gap: 4 },
    claimActions: { position: 'absolute', left: 18, right: 18, bottom: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    claimButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    claimButtonText: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', color: '#fff' },
    sheetSubTitle: { fontSize: 12, marginTop: 2, lineHeight: 16, textAlign: 'center' },
    sheetHeroRow: { flexDirection: 'row', gap: 8 },
    sheetHeroCard: { flex: 1, borderRadius: 16, padding: 12, gap: 6, borderWidth: 1 },
    sheetHeroLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    sheetValueBase: { fontSize: 18, lineHeight: 24 },
    sheetValuePrimary: { fontWeight: '400' },
    sheetValueSecondary: { fontWeight: '400' },
    sheetValuePhone: { fontWeight: '400' },
    sheetMetaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    sheetMetaCard: { flex: 1, borderRadius: 14, padding: 10, gap: 6, borderWidth: 1 },
    sheetMetaLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    sheetMetaValue: { fontSize: 18, fontWeight: '400', lineHeight: 24 },
    sheetLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
    sheetValue: { fontSize: 18, fontWeight: '400', lineHeight: 24 },
    sheetStatusPill: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 8 },
    sheetStatusText: { fontSize: 12, fontWeight: '700' },
    sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    sheetDetailsBlock: { marginTop: 6, gap: 6 },
    sheetDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    sheetDetailMain: { flex: 1, gap: 4 },
    sheetDetailSide: { flex: 1, gap: 6, alignItems: 'flex-start' },
    sheetInlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    sheetInlineBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' },
    sheetInlineText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    sheetInfoCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, borderWidth: 1 },
    sheetInfoMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
    sheetInfoText: { flex: 1, gap: 1 },
    sheetInfoLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    sheetInfoValue: { fontSize: 18, fontWeight: '400', lineHeight: 24 },
    sheetAddressBlock: { gap: 10 },
    sheetFieldBlock: { gap: 4 },
    sheetFieldLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
    sheetInfoActions: { flexDirection: 'row', gap: 8 },
    sheetPhoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
    sheetIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    sheetFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 18 },
    sheetFooterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    primarySheetButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 10,
        elevation: 6,
    },
    primarySheetButtonText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', color: '#fff' },
    secondarySheetButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
    },
    secondarySheetButtonText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    sheetPeek: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 76,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    sheetPeekHandle: { width: 28, height: 4, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.5)' },
    sheetPeekContent: { flex: 1 },
    sheetPeekLabel: { fontSize: 12, textTransform: 'uppercase', fontWeight: '700' },
    sheetPeekValue: { fontSize: 16, fontWeight: '600' },
    sheetPeekBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    sheetPeekBadgeText: { fontSize: 12, fontWeight: '700' },
    sheetModalRoot: { flex: 1, justifyContent: 'flex-end', zIndex: 999, elevation: 30 },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 1 },
    sheetContainer: { width: '100%', zIndex: 2 },
});
