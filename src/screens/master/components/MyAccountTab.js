import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardList, MessageCircle, Phone, Send, Settings, ShieldCheck, User, Wallet } from 'lucide-react-native';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { getOrderStatusLabel, getServiceLabel } from '../../../utils/orderHelpers';
import { ACCOUNT_VIEWS } from '../constants/domain';

const MyAccountTab = ({
    user,
    financials,
    earnings,
    orderHistory,
    balanceTransactions = [],
    districts = [],
    refreshing,
    onRefresh,
    accountView,
    setAccountView,
    styles,
}) => {
    const { t, language, setLanguage } = useLocalization();
    const { theme, isDark, toggleTheme } = useTheme();
    const safeT = useCallback((key, fallback) => {
        const value = t(key);
        return value && value !== key ? value : fallback;
    }, [t]);
    const [historyFilter, setHistoryFilter] = useState('all'); // all | financial | orders
    const [historySort, setHistorySort] = useState('desc'); // desc | asc
    const languageOptions = [
        { code: 'en', label: 'EN', flag: '🇬🇧' },
        { code: 'ru', label: 'RU', flag: '🇷🇺' },
        { code: 'kg', label: 'KG', flag: '🇰🇬' }
    ];
    const supportPhone = '+996500105415';
    const supportWhatsApp = 'https://wa.me/996500105415';
    const supportTelegram = 'https://t.me/konevor';
    const openSupportLink = (url) => {
        if (!url) return;
        Linking.openURL(url);
    };

    const getStatusColor = (status) => ({ confirmed: theme.accentSuccess, completed: theme.statusCompleted, canceled_by_master: theme.accentDanger, canceled_by_client: theme.accentWarning }[status] || theme.textMuted);

    const getStatusLabel = (status) => getOrderStatusLabel(status, t);

    const accountTitle = {
        [ACCOUNT_VIEWS.HISTORY]: t('sectionHistory'),
        [ACCOUNT_VIEWS.PROFILE]: t('sectionProfile'),
        [ACCOUNT_VIEWS.SETTINGS]: t('sectionSettings') || 'Settings'
    }[accountView];
    const orderById = useMemo(() => new Map(orderHistory.map(o => [o.id, o])), [orderHistory]);
    const uuidRegex = useMemo(() => /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, []);
    const contextSeparator = ' - ';
    const districtLabelByCode = useMemo(() => {
        const map = {};
        districts.forEach((d) => {
            if (!d?.code) return;
            const localized = language === 'ru'
                ? (d.name_ru || d.name_en)
                : language === 'kg'
                    ? (d.name_kg || d.name_en)
                    : d.name_en;
            map[String(d.code).toLowerCase()] = localized;
        });
        return map;
    }, [districts, language]);
    const getAreaLabel = useCallback((area) => {
        if (!area) return '-';
        const raw = String(area).trim();
        const normalized = raw.toLowerCase();
        if (districtLabelByCode[normalized]) {
            return districtLabelByCode[normalized];
        }
        const parts = raw.split(/вЂ”|-/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
            const tail = parts[parts.length - 1].toLowerCase();
            if (districtLabelByCode[tail]) {
                return `${parts.slice(0, -1).join(' вЂ” ')} вЂ” ${districtLabelByCode[tail]}`;
            }
        }
        return raw;
    }, [districtLabelByCode]);
    const formatOrderContext = useCallback((serviceType, area) => {
        const serviceLabel = getServiceLabel(serviceType, t);
        const areaLabel = getAreaLabel(area);
        return `${serviceLabel}${contextSeparator}${areaLabel}`;
    }, [getAreaLabel, t]);
    const historyRows = useMemo(() => {
        if (accountView !== ACCOUNT_VIEWS.HISTORY) return [];
        const combinedHistory = [
            ...orderHistory.map(o => ({ ...o, type: 'order', date: new Date(o.created_at) })),
            ...balanceTransactions.map(tx => ({ ...tx, type: 'transaction', date: new Date(tx.created_at) }))
        ].sort((a, b) => historySort === 'desc' ? (b.date - a.date) : (a.date - b.date));
        const filteredHistory = combinedHistory.filter(item => {
            if (historyFilter === 'financial') return item.type === 'transaction';
            if (historyFilter === 'orders') return item.type === 'order';
            return true;
        });
        if (!filteredHistory.length) return [];
        const locale = language === 'ru' ? 'ru-RU' : language === 'kg' ? 'ky-KG' : 'en-US';
        const nowYear = new Date().getFullYear();
        const formatDayKey = (dateObj) => {
            const d = new Date(dateObj);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const formatDayLabel = (dateObj) => {
            const d = new Date(dateObj);
            const isCurrentYear = d.getFullYear() === nowYear;
            return d.toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
                ...(isCurrentYear ? {} : { year: 'numeric' })
            });
        };
        const grouped = filteredHistory.reduce((acc, item) => {
            const key = formatDayKey(item.date);
            if (!acc[key]) acc[key] = { key, label: formatDayLabel(item.date), items: [] };
            acc[key].items.push(item);
            return acc;
        }, {});
        const rows = [];
        Object.values(grouped).forEach((group) => {
            rows.push({ type: 'group', key: `g-${group.key}`, label: group.label });
            group.items.forEach((item) => rows.push({ type: 'row', key: `${item.type}-${item.id}`, item }));
        });
        return rows;
    }, [accountView, balanceTransactions, historyFilter, historySort, language, orderHistory]);
    const formatAccountingAmount = (value) => {
        const num = Number(value);
        if (Number.isNaN(num)) return '-';
        const abs = Math.abs(num).toFixed(0);
        return num < 0 ? `(${abs})` : abs;
    };
    const getAmountColor = (value) => {
        const num = Number(value);
        if (Number.isNaN(num) || num === 0) return theme.textMuted;
        return num < 0 ? theme.accentDanger : theme.accentSuccess;
    };
    const historyEmpty = historyRows.length === 0;
    const renderTransactionRow = useCallback((item) => {
        const isCommissionTx = String(item.transaction_type || '').includes('commission');
        const noteText = String(item.notes || '').trim();
        const uuidMatch = noteText.match(uuidRegex);
        const relatedOrder = uuidMatch ? orderById.get(uuidMatch[0]) : null;
        const txTypeLabel = {
            top_up: safeT('transactionTopUp', 'Top up'),
            adjustment: safeT('transactionAdjustment', 'Adjustment'),
            refund: safeT('transactionRefund', 'Refund'),
            waiver: safeT('transactionWaiver', 'Waiver'),
            commission: safeT('transactionCommission', 'Commission'),
            commission_deduct: safeT('transactionCommission', 'Commission'),
            initial_deposit: safeT('transactionInitialDeposit', 'Initial deposit')
        }[item.transaction_type] || (isCommissionTx
            ? safeT('transactionCommission', 'Commission')
            : (item.transaction_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
        const contextLabel = isCommissionTx || relatedOrder
            ? safeT('historyOrderTag', 'Order')
            : safeT('historyTransactionTag', 'Transaction');
        return (
            <View style={[styles.historyRow, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                <Text style={[styles.historyCell, styles.historyCellType, { color: theme.textPrimary }]} numberOfLines={1}>
                    {txTypeLabel}
                </Text>
                <Text style={[styles.historyCell, styles.historyCellDetails, { color: theme.textMuted }]} numberOfLines={1}>
                    {contextLabel}
                </Text>
                <View style={[styles.historyCell, styles.historyCellAmount]}>
                    <Text style={{ color: getAmountColor(item.amount), fontWeight: '400', fontSize: 11 }}>
                        {formatAccountingAmount(item.amount)}
                    </Text>
                </View>
            </View>
        );
    }, [formatAccountingAmount, getAmountColor, orderById, safeT, theme, uuidRegex]);
    const renderOrderRow = useCallback((o) => {
        const orderArea = o.area || o.district || '-';
        const orderContext = formatOrderContext(o.service_type, orderArea);
        const orderEventLabel = {
            completed: safeT('jobCompleted', 'Job completed'),
            confirmed: safeT('jobConfirmed', 'Job confirmed'),
            canceled_by_master: safeT('jobCanceled', 'Job canceled'),
            canceled_by_client: safeT('jobCanceled', 'Job canceled'),
            expired: safeT('jobExpired', 'Job expired'),
        }[o.status] || getStatusLabel(o.status);
        const isOrderNoAmount = ['canceled_by_master', 'canceled_by_client', 'expired'].includes(o.status);
        return (
            <View style={[styles.historyRow, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                <Text style={[styles.historyCell, styles.historyCellType, { color: theme.textPrimary }]} numberOfLines={1}>
                    {orderEventLabel}
                </Text>
                <Text style={[styles.historyCell, styles.historyCellDetails, { color: theme.textMuted }]} numberOfLines={1}>
                    {orderContext}
                </Text>
                <View style={[styles.historyCell, styles.historyCellAmount]}>
                    {isOrderNoAmount ? (
                        <Text style={{ color: theme.textMuted, fontWeight: '400', fontSize: 11 }}>
                            {safeT('historyNoAmount', 'вЂ”')}
                        </Text>
                    ) : (
                        <Text style={{ color: theme.accentSuccess, fontWeight: '400', fontSize: 11 }}>
                            {formatAccountingAmount(o.final_price ?? o.initial_price ?? o.callout_fee ?? 0)}
                        </Text>
                    )}
                </View>
            </View>
        );
    }, [formatAccountingAmount, formatOrderContext, getStatusLabel, safeT, theme]);
    const renderHistoryItem = useCallback(({ item }) => {
        if (item.type === 'group') {
            return (
                <View style={[styles.historyGroupHeader, { borderTopColor: theme.borderPrimary, backgroundColor: theme.bgCard }]}>
                    <Text style={[styles.historyGroupHeaderText, { color: theme.textSecondary }]}>{item.label}</Text>
                </View>
            );
        }
        const row = item.item;
        return row.type === 'transaction'
            ? renderTransactionRow(row)
            : renderOrderRow(row);
    }, [renderOrderRow, renderTransactionRow, theme]);
    const historyHeaderRow = useMemo(() => (
        <View style={[styles.historyRow, styles.historyHeaderRow, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
            <Text style={[styles.historyCell, styles.historyCellType, { color: theme.textMuted }]}>
                {safeT('historyColType', 'Type')}
            </Text>
            <Text style={[styles.historyCell, styles.historyCellDetails, { color: theme.textMuted }]}>
                {safeT('historyColDetails', 'Details')}
            </Text>
            <Text style={[styles.historyCell, styles.historyCellAmount, { color: theme.textMuted }]}>
                {safeT('historyColAmount', 'Amount')}
            </Text>
        </View>
    ), [safeT, theme]);

    if (accountView === ACCOUNT_VIEWS.HISTORY) {
        return (
            <View style={styles.accountContainer}>
                <View style={styles.accountHeaderRow}>
                    <TouchableOpacity
                        style={[styles.accountBackBtn, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                        onPress={() => setAccountView(ACCOUNT_VIEWS.MENU)}
                    >
                        <ChevronLeft size={18} color={theme.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.accountHeaderTitle, { color: theme.textPrimary }]}>{accountTitle}</Text>
                </View>
                <View style={[styles.historySection, { flex: 1 }]}>
                    <View style={styles.historyFilterRow}>
                        {[
                            { key: 'all', label: safeT('filterAll', 'All') },
                            { key: 'financial', label: safeT('historyFilterFinancial', 'Financial') },
                            { key: 'orders', label: safeT('historyFilterOrders', 'Orders') },
                        ].map((option) => {
                            const isActive = historyFilter === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    style={[
                                        styles.historyFilterChip,
                                        {
                                            backgroundColor: isActive ? `${theme.accentIndigo}18` : theme.bgCard,
                                            borderColor: isActive ? theme.accentIndigo : theme.borderPrimary,
                                        },
                                    ]}
                                    onPress={() => setHistoryFilter(option.key)}
                                >
                                    <Text style={{ color: isActive ? theme.accentIndigo : theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={styles.historySortRow}>
                        {[
                            { key: 'desc', label: safeT('filterNewestFirst', 'Newest First') },
                            { key: 'asc', label: safeT('filterOldestFirst', 'Oldest First') },
                        ].map((option) => {
                            const isActive = historySort === option.key;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    style={[
                                        styles.historySortChip,
                                        {
                                            backgroundColor: isActive ? `${theme.accentIndigo}18` : theme.bgCard,
                                            borderColor: isActive ? theme.accentIndigo : theme.borderPrimary,
                                        },
                                    ]}
                                    onPress={() => setHistorySort(option.key)}
                                >
                                    <Text style={{ color: isActive ? theme.accentIndigo : theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {historyEmpty ? (
                        <View style={styles.emptyState}>
                            <ClipboardList size={40} color={theme.textMuted} />
                            <Text style={{ color: theme.textMuted }}>{t('noOrderHistory')}</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={historyRows}
                            keyExtractor={(item) => item.key}
                            renderItem={renderHistoryItem}
                            ListHeaderComponent={historyHeaderRow}
                            ListFooterComponent={<View style={{ height: 80 }} />}
                            style={[styles.historyTable, { borderColor: theme.borderPrimary, flex: 1 }]}
                            contentContainerStyle={{ paddingBottom: 12 }}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}
                            initialNumToRender={18}
                            maxToRenderPerBatch={24}
                            windowSize={8}
                            updateCellsBatchingPeriod={50}
                            removeClippedSubviews={Platform.OS === 'android'}
                        />
                    )}
                </View>
            </View>
        );
    }

    return (
        <ScrollView style={styles.accountContainer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accentIndigo} />}>
            {accountView !== ACCOUNT_VIEWS.MENU && (
                <View style={styles.accountHeaderRow}>
                    <TouchableOpacity
                        style={[styles.accountBackBtn, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                        onPress={() => setAccountView(ACCOUNT_VIEWS.MENU)}
                    >
                        <ChevronLeft size={18} color={theme.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.accountHeaderTitle, { color: theme.textPrimary }]}>{accountTitle}</Text>
                </View>
            )}

            {accountView === ACCOUNT_VIEWS.MENU && (
                <>
                    {/* Balance Card */}
                    <View style={[styles.balanceCard, { backgroundColor: theme.bgCard, borderColor: financials?.balanceBlocked ? theme.accentDanger : theme.borderPrimary }]}>
                        <View style={styles.balanceHeader}><Wallet size={20} color={theme.accentIndigo} /><Text style={[styles.balanceLabel, { color: theme.textMuted }]}>{t('prepaidBalance')}</Text></View>
                        <Text style={[styles.balanceValue, { color: financials?.balanceBlocked ? theme.accentDanger : theme.textPrimary }]}>{financials?.prepaidBalance?.toFixed(0) || 0}</Text>
                        {financials?.balanceBlocked && <View style={[styles.blockedBadge, { backgroundColor: `${theme.accentDanger}20` }]}><AlertCircle size={12} color={theme.accentDanger} /><Text style={{ color: theme.accentDanger, fontSize: 11 }}>{t('balanceBlocked')}</Text></View>}
                        <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>{t('initialDeposit')}: {financials?.initialDeposit || 0} | {t('threshold')}: {financials?.balanceThreshold || 0}</Text>
                    </View>

                    <View style={styles.accountMenu}>
                        <TouchableOpacity
                            style={[styles.accountMenuItem, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                            onPress={() => setAccountView(ACCOUNT_VIEWS.HISTORY)}
                        >
                            <View style={[styles.accountMenuIcon, { backgroundColor: `${theme.accentIndigo}15` }]}>
                                <ClipboardList size={18} color={theme.accentIndigo} />
                            </View>
                            <Text style={[styles.accountMenuLabel, { color: theme.textPrimary }]}>{t('sectionHistory')}</Text>
                            <ChevronRight size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.accountMenuItem, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                            onPress={() => setAccountView(ACCOUNT_VIEWS.PROFILE)}
                        >
                            <View style={[styles.accountMenuIcon, { backgroundColor: `${theme.accentSuccess}15` }]}>
                                <User size={18} color={theme.accentSuccess} />
                            </View>
                            <Text style={[styles.accountMenuLabel, { color: theme.textPrimary }]}>{t('sectionProfile')}</Text>
                            <ChevronRight size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.accountMenuItem, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}
                            onPress={() => setAccountView(ACCOUNT_VIEWS.SETTINGS)}
                        >
                            <View style={[styles.accountMenuIcon, { backgroundColor: `${theme.accentWarning}15` }]}>
                                <Settings size={18} color={theme.accentWarning} />
                            </View>
                            <Text style={[styles.accountMenuLabel, { color: theme.textPrimary }]}>{t('sectionSettings') || 'Settings'}</Text>
                            <ChevronRight size={16} color={theme.textMuted} />
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {/* Profile Section */}
            {accountView === ACCOUNT_VIEWS.PROFILE && (
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
            {accountView === ACCOUNT_VIEWS.SETTINGS && (
                <View style={styles.settingsSection}>
                    <View style={[styles.settingsCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                        <Text style={[styles.settingsTitle, { color: theme.textPrimary }]}>{t('settingsLanguage') || 'Language'}</Text>
                        <View style={styles.settingsOptionsRow}>
                            {languageOptions.map(option => (
                                <TouchableOpacity
                                    key={option.code}
                                    style={[
                                        styles.settingsOption,
                                        {
                                            backgroundColor: language === option.code ? `${theme.accentIndigo}15` : theme.bgSecondary,
                                            borderColor: language === option.code ? theme.accentIndigo : theme.borderPrimary
                                        }
                                    ]}
                                    onPress={() => setLanguage(option.code)}
                                >
                                    <Text style={{ fontSize: 16 }}>{option.flag}</Text>
                                    <Text style={{ color: language === option.code ? theme.accentIndigo : theme.textSecondary, fontWeight: '700', fontSize: 11 }}>
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                    <View style={[styles.settingsCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                        <View style={styles.settingsToggleRow}>
                            <View>
                                <Text style={[styles.settingsTitle, { color: theme.textPrimary }]}>{t('settingsTheme') || 'Theme'}</Text>
                                <Text style={{ color: theme.textMuted, fontSize: 11 }}>{t('settingsThemeHint') || 'Adjust appearance'}</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.settingsToggle, { backgroundColor: isDark ? theme.accentIndigo : theme.borderSecondary }]}
                                onPress={toggleTheme}
                            >
                                <View style={[styles.settingsToggleThumb, { left: isDark ? 22 : 3 }]} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={[styles.settingsCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary }]}>
                        <Text style={[styles.settingsTitle, { color: theme.textPrimary }]}>{t('settingsSupport') || 'Support'}</Text>
                        <View style={styles.settingsSupportList}>
                            <TouchableOpacity
                                style={[styles.settingsSupportRow, { borderColor: theme.borderPrimary, backgroundColor: theme.bgSecondary }]}
                                onPress={() => openSupportLink(`tel:${supportPhone}`)}
                            >
                                <View style={styles.settingsSupportLeft}>
                                    <Phone size={16} color={theme.textMuted} />
                                    <Text style={[styles.settingsSupportLabel, { color: theme.textPrimary }]}>{t('settingsSupportPhone') || 'Call Support'}</Text>
                                </View>
                                <Text style={[styles.settingsSupportValue, { color: theme.textMuted }]}>{supportPhone}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.settingsSupportRow, { borderColor: theme.borderPrimary, backgroundColor: theme.bgSecondary }]}
                                onPress={() => openSupportLink(supportWhatsApp)}
                            >
                                <View style={styles.settingsSupportLeft}>
                                    <MessageCircle size={16} color={theme.textMuted} />
                                    <Text style={[styles.settingsSupportLabel, { color: theme.textPrimary }]}>{t('settingsSupportWhatsApp') || 'WhatsApp'}</Text>
                                </View>
                                <Text style={[styles.settingsSupportValue, { color: theme.textMuted }]}>+996 500 105 415</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.settingsSupportRow, { borderColor: theme.borderPrimary, backgroundColor: theme.bgSecondary }]}
                                onPress={() => openSupportLink(supportTelegram)}
                            >
                                <View style={styles.settingsSupportLeft}>
                                    <Send size={16} color={theme.textMuted} />
                                    <Text style={[styles.settingsSupportLabel, { color: theme.textPrimary }]}>{t('settingsSupportTelegram') || 'Telegram'}</Text>
                                </View>
                                <Text style={[styles.settingsSupportValue, { color: theme.textMuted }]}>@konevor</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            <View style={{ height: 100 }} />
        </ScrollView>
    );
};

export default MyAccountTab;
