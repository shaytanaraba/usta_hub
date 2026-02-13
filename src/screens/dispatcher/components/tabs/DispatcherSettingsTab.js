import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

const THEME_OPTIONS = [
  { id: 'light', icon: '\u2600', labelKey: 'settingsThemeLight', fallback: 'Light' },
  { id: 'dark', icon: '\u263E', labelKey: 'settingsThemeDark', fallback: 'Dark' },
];

const PARTNER_SETTINGS_VIEWS = {
  MAIN: 'main',
  EARNINGS: 'earnings',
};

const statusColorMap = {
  requested: '#f59e0b',
  paid: '#22c55e',
  rejected: '#ef4444',
  earned: '#3b82f6',
};

const normalizeLabelCasing = (value) => {
  if (typeof value !== 'string') return value;
  const letters = Array.from(value).filter((char) => char.toLocaleLowerCase() !== char.toLocaleUpperCase());
  if (letters.length === 0) return value;
  const isAllUpper = letters.every((char) => char === char.toLocaleUpperCase());
  if (!isAllUpper) return value;
  const lower = value.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
};

const formatAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString();
};

const formatAmountInput = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  const fixed = (Math.round(num * 100) / 100).toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d*[1-9])0$/, '$1');
};

const toTimestamp = (value) => {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
};

export default function DispatcherSettingsTab({
  styles,
  isDark,
  translations,
  language,
  user,
  setLanguage,
  setIsDark,
  loading,
  skeletonPulse,
  isPartner,
  partnerFinanceSummary,
  partnerPayoutRequests,
  partnerTransactions,
  partnerPayoutAmount,
  setPartnerPayoutAmount,
  partnerPayoutNote,
  setPartnerPayoutNote,
  onSubmitPartnerPayout,
  partnerFinanceLoading,
  actionLoading,
  openPayoutComposerToken,
  onOpenAddMaster,
  addMasterDisabled,
}) {
  const TRANSLATIONS = translations;
  const profileFallbackName = user?.role === 'partner'
    ? (TRANSLATIONS[language].partnerRole || 'Partner')
    : (TRANSLATIONS[language].dispatcherRole || 'Dispatcher');
  const profileName = user?.full_name || profileFallbackName;
  const profilePhone = user?.phone || user?.phone_number || user?.phoneNumber || '-';
  const profileEmail = user?.email || '-';
  const profileRole = user?.role === 'partner'
    ? (TRANSLATIONS[language].partnerRole || 'Partner')
    : (TRANSLATIONS[language].dispatcherRole || 'Dispatcher');
  const sectionEarningsLabel = TRANSLATIONS[language].partnerEarnings
    || TRANSLATIONS[language].sectionEarnings
    || 'Earnings';
  const isEnabled = user?.is_verified === true;
  const accessLabelRaw = isEnabled
    ? (TRANSLATIONS[language].verified || 'Verified')
    : (TRANSLATIONS[language].unverified || 'Unverified');
  const accessLabel = normalizeLabelCasing(accessLabelRaw);
  const themeMode = isDark ? 'dark' : 'light';
  const initials = profileName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const partnerData = partnerFinanceSummary || {};
  const minPayout = Number(partnerData.minPayout || 50);
  const currentBalance = Number(partnerData.balance || 0);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [partnerSettingsView, setPartnerSettingsView] = useState(PARTNER_SETTINGS_VIEWS.MAIN);
  const [payoutTouched, setPayoutTouched] = useState(false);
  const [payoutSubmitAttempted, setPayoutSubmitAttempted] = useState(false);
  const lastComposerTokenRef = useRef(0);
  const [partnerHistoryFilter, setPartnerHistoryFilter] = useState('all');
  const [partnerHistorySort, setPartnerHistorySort] = useState('desc');
  const [partnerHistoryVisibleCount, setPartnerHistoryVisibleCount] = useState(12);

  const sortedPayoutRequests = useMemo(() => {
    const items = Array.isArray(partnerPayoutRequests) ? [...partnerPayoutRequests] : [];
    items.sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
    return items;
  }, [partnerPayoutRequests]);

  const pendingRequest = useMemo(
    () => sortedPayoutRequests.find((item) => item.status === 'requested') || null,
    [sortedPayoutRequests]
  );
  const pendingRequestedAmount = useMemo(
    () => sortedPayoutRequests
      .filter((item) => item.status === 'requested')
      .reduce((sum, item) => sum + Number(item.requested_amount || 0), 0),
    [sortedPayoutRequests]
  );
  const orderHistoryRows = useMemo(() => (
    (Array.isArray(partnerTransactions) ? partnerTransactions : [])
      .filter((item) => String(item?.transaction_type || '') === 'commission_earned')
      .map((item) => ({
        id: `order-${item.id}`,
        kind: 'orders',
        sortTs: toTimestamp(item.created_at),
        title: `${TRANSLATIONS[language].historyFilterOrders || 'Order'} #${String(item.order_id || item.id || '').slice(-8)}`,
        meta: item.created_at ? new Date(item.created_at).toLocaleString() : '',
        amount: Math.max(0, Number(item.amount || 0)),
        sign: '+',
        status: 'earned',
        statusLabel: TRANSLATIONS[language].statusConfirmed || TRANSLATIONS[language].partnerEarned || 'Earned',
      }))
  ), [partnerTransactions, TRANSLATIONS, language]);
  const payoutHistoryRows = useMemo(() => (
    sortedPayoutRequests.map((item) => ({
      id: `payout-${item.id}`,
      kind: 'payouts',
      sortTs: toTimestamp(item.created_at),
      title: `${TRANSLATIONS[language].partnerPayoutRequest || 'Payout'} #${String(item.id || '').slice(-8)}`,
      meta: item.created_at ? new Date(item.created_at).toLocaleString() : '',
      amount: Math.max(0, Number(item.status === 'paid' ? (item.approved_amount ?? item.requested_amount) : item.requested_amount || 0)),
      sign: '-',
      status: String(item.status || 'requested').toLowerCase(),
      statusLabel: String(item.status || 'requested').toUpperCase(),
    }))
  ), [sortedPayoutRequests, TRANSLATIONS, language]);
  const filteredHistoryRows = useMemo(() => {
    const merged = [...orderHistoryRows, ...payoutHistoryRows];
    const filtered = partnerHistoryFilter === 'all'
      ? merged
      : merged.filter((item) => item.kind === partnerHistoryFilter);
    filtered.sort((a, b) => (partnerHistorySort === 'desc' ? b.sortTs - a.sortTs : a.sortTs - b.sortTs));
    return filtered;
  }, [orderHistoryRows, payoutHistoryRows, partnerHistoryFilter, partnerHistorySort]);
  const visibleHistoryRows = filteredHistoryRows.slice(0, partnerHistoryVisibleCount);
  const canLoadMoreHistory = partnerHistoryVisibleCount < filteredHistoryRows.length;

  const parsedPayoutAmount = Number(String(partnerPayoutAmount || '').replace(',', '.'));
  let payoutValidationMessage = '';
  if (pendingRequest) {
    payoutValidationMessage = TRANSLATIONS[language].partnerPayoutPending || 'Payout request is already pending';
  } else if (String(partnerPayoutAmount || '').trim().length === 0) {
    payoutValidationMessage = TRANSLATIONS[language].toastFillRequired || 'Enter payout amount';
  } else if (!Number.isFinite(parsedPayoutAmount) || parsedPayoutAmount <= 0) {
    payoutValidationMessage = TRANSLATIONS[language].toastFillRequired || 'Enter payout amount';
  } else if (parsedPayoutAmount < minPayout) {
    payoutValidationMessage = `${TRANSLATIONS[language].partnerMinPayoutHint || 'Minimum payout'}: ${minPayout} ${TRANSLATIONS[language].currencySom || 'som'}`;
  } else if (parsedPayoutAmount > currentBalance) {
    payoutValidationMessage = TRANSLATIONS[language].insufficientBalance || 'Insufficient balance';
  }
  const showPayoutValidation = (payoutTouched || payoutSubmitAttempted) && Boolean(payoutValidationMessage);
  const canSubmitPayout = !payoutValidationMessage && !actionLoading && !loading && !partnerFinanceLoading;
  const requestButtonDisabled = loading || partnerFinanceLoading || actionLoading || Boolean(pendingRequest);
  const createMasterDisabled = loading || Boolean(addMasterDisabled) || typeof onOpenAddMaster !== 'function';
  const addMasterSectionTitle = TRANSLATIONS[language].addNewMaster
    || TRANSLATIONS[language].createMaster
    || 'Add New Master';

  const handleSupport = () => Linking.openURL('tel:+996500105415');
  const handleWhatsApp = () => Linking.openURL('https://wa.me/996500105415');
  const handleTelegram = () => Linking.openURL('https://t.me/konevor');

  const renderValueSkeleton = (style) => (
    <Animated.View style={[style, { opacity: skeletonPulse }]} />
  );

  useEffect(() => {
    setPartnerHistoryVisibleCount(12);
  }, [partnerHistoryFilter, partnerHistorySort]);

  useEffect(() => {
    if (!isPartner) {
      setPartnerSettingsView(PARTNER_SETTINGS_VIEWS.MAIN);
    }
  }, [isPartner]);

  useEffect(() => {
    if (!isPartner) return;
    const token = Number(openPayoutComposerToken || 0);
    if (!token || token === lastComposerTokenRef.current) return;
    lastComposerTokenRef.current = token;
    setPartnerSettingsView(PARTNER_SETTINGS_VIEWS.EARNINGS);
    setPayoutTouched(false);
    setPayoutSubmitAttempted(false);
    setShowPayoutModal(true);
  }, [isPartner, openPayoutComposerToken]);

  const closePayoutModal = useCallback(() => {
    if (actionLoading) return;
    setShowPayoutModal(false);
  }, [actionLoading]);

  const openPayoutModal = useCallback(() => {
    if (requestButtonDisabled) return;
    setPayoutTouched(false);
    setPayoutSubmitAttempted(false);
    setShowPayoutModal(true);
  }, [requestButtonDisabled]);

  const setQuickAmount = useCallback((amountValue) => {
    setPayoutTouched(true);
    setPayoutSubmitAttempted(false);
    setPartnerPayoutAmount?.(formatAmountInput(amountValue));
  }, [setPartnerPayoutAmount]);

  const submitPayout = useCallback(async () => {
    setPayoutSubmitAttempted(true);
    if (!canSubmitPayout) return;
    if (typeof onSubmitPartnerPayout !== 'function') return;
    const isSuccess = await onSubmitPartnerPayout();
    if (isSuccess) {
      setShowPayoutModal(false);
      setPayoutTouched(false);
      setPayoutSubmitAttempted(false);
    }
  }, [onSubmitPartnerPayout, canSubmitPayout]);

  const renderChip = ({
    id,
    label,
    isActive,
    onPress,
    compact = false,
  }) => (
    <TouchableOpacity
      key={id}
      style={[
        styles.settingsActionBtn,
        !isDark && styles.settingsActionBtnLight,
        {
          paddingVertical: compact ? 6 : 8,
          backgroundColor: isActive
            ? (isDark ? 'rgba(59,130,246,0.35)' : '#dbeafe')
            : undefined,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.settingsActionText,
          !isDark && styles.settingsActionTextLight,
          {
            color: isActive
              ? (isDark ? '#bfdbfe' : '#1d4ed8')
              : undefined,
            fontSize: compact ? 11 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderPersonalSection = () => (
    <>
      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].sectionProfile || 'Profile'}</Text>
        <View style={styles.settingsProfileRow}>
          <View style={[styles.settingsAvatar, loading && styles.settingsAvatarSkeleton]}>
            {!loading && <Text style={styles.settingsAvatarText}>{initials}</Text>}
          </View>
          <View style={styles.settingsProfileInfo}>
            {loading
              ? renderValueSkeleton(styles.settingsValueSkeleton)
              : <Text style={[styles.settingsValue, !isDark && styles.textDark]}>{profileName}</Text>}
            <View style={[styles.settingsRoleChip, !isDark && styles.settingsRoleChipLight]}>
              {loading
                ? renderValueSkeleton(styles.settingsRoleSkeleton)
                : (
                  <Text style={[styles.settingsRoleText, !isDark && styles.settingsRoleTextLight]}>
                    {profileRole}
                  </Text>
                )}
            </View>
          </View>
        </View>
        {loading
          ? renderValueSkeleton(styles.settingsMetaSkeleton)
          : <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].phone}: {profilePhone}</Text>}
        {loading
          ? renderValueSkeleton(styles.settingsMetaSkeletonShort)
          : <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{profileEmail}</Text>}
        <View style={[styles.settingsStatusRow, !isDark && styles.settingsStatusRowLight, { marginTop: 6 }]}>
          <View
            style={[
              styles.settingsStatusDot,
              { backgroundColor: loading ? (isDark ? '#64748b' : '#cbd5e1') : (isEnabled ? '#22c55e' : '#ef4444') },
            ]}
          />
          {loading
            ? renderValueSkeleton(styles.settingsStatusSkeleton)
            : <Text style={[styles.settingsStatusValue, !isDark && styles.settingsStatusValueLight]}>{accessLabel}</Text>}
        </View>
      </View>

      {isPartner && (
        <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
            {sectionEarningsLabel}
          </Text>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={() => setPartnerSettingsView(PARTNER_SETTINGS_VIEWS.EARNINGS)}
          >
            <View style={styles.settingsSupportLeft}>
              <Ionicons
                name="wallet-outline"
                size={16}
                color={isDark ? '#60a5fa' : '#2563eb'}
                style={styles.settingsSupportIcon}
              />
              <View>
                <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                  {TRANSLATIONS[language].actionView || 'View'}
                </Text>
                <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>
                  {formatAmount(currentBalance)} {TRANSLATIONS[language].currencySom || 'som'}
                </Text>
              </View>
            </View>
            <Text style={[styles.partnerPageArrow, !isDark && styles.textSecondary]}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
          {addMasterSectionTitle}
        </Text>
        <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
          {TRANSLATIONS[language].createNewMasterAccount || 'Create a new master account (requires admin verification)'}
        </Text>
        <TouchableOpacity
          style={[
            styles.partnerActionBtn,
            createMasterDisabled && (isDark ? styles.bottomPublishBtnDisabled : styles.partnerActionBtnDisabledLight),
          ]}
          onPress={onOpenAddMaster}
          disabled={createMasterDisabled}
        >
          <Text
            style={[
              styles.partnerActionBtnText,
              createMasterDisabled && !isDark && styles.partnerActionBtnTextDisabledLight,
            ]}
          >
            {TRANSLATIONS[language].actionView || 'View'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <View style={styles.settingsToggleRow}>
          <View>
            <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsTheme || 'Theme'}</Text>
            <Text style={[styles.settingsHint, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsThemeHint || 'Adjust appearance'}</Text>
          </View>
          <View style={[styles.settingsThemeSwitch, !isDark && styles.settingsThemeSwitchLight]}>
            {THEME_OPTIONS.map((option) => {
              const isActive = themeMode === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.settingsThemeOption,
                    isActive && styles.settingsThemeOptionActive,
                    !isDark && styles.settingsThemeOptionLight,
                    !isDark && isActive && styles.settingsThemeOptionActiveLight,
                  ]}
                  onPress={() => setIsDark(option.id === 'dark')}
                >
                  <Text
                    style={[
                      styles.settingsThemeOptionIcon,
                      isActive && styles.settingsThemeOptionIconActive,
                      !isDark && styles.settingsThemeOptionIconLight,
                      !isDark && isActive && styles.settingsThemeOptionIconActiveLight,
                    ]}
                  >
                    {option.icon}
                  </Text>
                  <Text
                    style={[
                      styles.settingsThemeOptionText,
                      isActive && styles.settingsThemeOptionTextActive,
                      !isDark && styles.settingsThemeOptionTextLight,
                      !isDark && isActive && styles.settingsThemeOptionTextActiveLight,
                    ]}
                  >
                    {TRANSLATIONS[language][option.labelKey] || option.fallback}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <View style={styles.settingsToggleRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].settingsLanguage || 'Language'}
            </Text>
            <Text style={[styles.settingsHint, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].settingsLanguageHint || 'Choose app language'}
            </Text>
          </View>
          <View style={[styles.settingsThemeSwitch, !isDark && styles.settingsThemeSwitchLight]}>
            {['en', 'ru', 'kg'].map((code) => {
              const isActive = language === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.settingsThemeOption,
                    isActive && styles.settingsThemeOptionActive,
                    !isDark && styles.settingsThemeOptionLight,
                    !isDark && isActive && styles.settingsThemeOptionActiveLight,
                    { paddingHorizontal: 8, gap: 4 },
                  ]}
                  onPress={() => {
                    if (language !== code) {
                      setLanguage?.(code);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.settingsThemeOptionText,
                      isActive && styles.settingsThemeOptionTextActive,
                      !isDark && styles.settingsThemeOptionTextLight,
                      !isDark && isActive && styles.settingsThemeOptionTextActiveLight,
                      { fontSize: 11 },
                    ]}
                  >
                    {String(code).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsSupport || 'Support'}</Text>
        <View style={styles.settingsSupportList}>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleSupport}
          >
            <View style={styles.settingsSupportLeft}>
              <Feather
                name="phone"
                size={16}
                color={isDark ? '#94a3b8' : '#64748b'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportPhone || 'Call Support'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>+996 500 105 415</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleWhatsApp}
          >
            <View style={styles.settingsSupportLeft}>
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={isDark ? '#22c55e' : '#16a34a'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportWhatsApp || 'WhatsApp'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>+996 500 105 415</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleTelegram}
          >
            <View style={styles.settingsSupportLeft}>
              <Ionicons
                name="paper-plane"
                size={16}
                color={isDark ? '#60a5fa' : '#2563eb'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportTelegram || 'Telegram'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>@konevor</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const renderPartnerEarningsSection = () => (
    <>
      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <View style={styles.partnerSubpageHeaderRow}>
          <TouchableOpacity
            style={[styles.partnerSubpageBackBtn, !isDark && styles.partnerSubpageBackBtnLight]}
            onPress={() => setPartnerSettingsView(PARTNER_SETTINGS_VIEWS.MAIN)}
          >
            <Ionicons
              name="arrow-back"
              size={16}
              color={isDark ? '#93c5fd' : '#1d4ed8'}
            />
            <Text style={[styles.partnerSubpageBackText, !isDark && styles.partnerSubpageBackTextLight]}>
              {TRANSLATIONS[language].tabSettings || TRANSLATIONS[language].settings || 'Settings'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.partnerSubpageTitle, !isDark && styles.textDark]}>
            {sectionEarningsLabel}
          </Text>
        </View>
        <Text style={[styles.partnerBalanceValue, !isDark && styles.textDark]}>
          {formatAmount(currentBalance)} {TRANSLATIONS[language].currencySom || 'som'}
        </Text>
        <Text style={[styles.partnerSummaryMeta, !isDark && styles.textSecondary]}>
          {(TRANSLATIONS[language].commissionRate || 'Commission')}: {Number(partnerData.commissionRatePercent || 0).toFixed(2)}%
          {' | '}
          {(TRANSLATIONS[language].partnerMinPayoutHint || 'Minimum payout')}: {minPayout} {TRANSLATIONS[language].currencySom || 'som'}
        </Text>
        <View style={styles.partnerMetricGrid}>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerEarned || 'Earned'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(partnerData.earnedTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerPaidOut || 'Paid Out'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(partnerData.paidTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].pending || 'In progress'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(pendingRequestedAmount)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
        </View>
        <View style={styles.settingsActionRow}>
          <TouchableOpacity
            style={[
              styles.partnerActionBtn,
              requestButtonDisabled && (isDark ? styles.bottomPublishBtnDisabled : styles.partnerActionBtnDisabledLight),
            ]}
            onPress={openPayoutModal}
            disabled={requestButtonDisabled}
          >
            <Text
              style={[
                styles.partnerActionBtnText,
                requestButtonDisabled && !isDark && styles.partnerActionBtnTextDisabledLight,
              ]}
            >
              {TRANSLATIONS[language].partnerRequestNow || 'Request Payout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <View style={styles.partnerHistoryHeaderRow}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
            {TRANSLATIONS[language].partnerRequestsHistory || TRANSLATIONS[language].sectionHistory || 'History'}
          </Text>
          <TouchableOpacity
            style={[styles.partnerSortToggleBtn, !isDark && styles.partnerSortToggleBtnLight]}
            onPress={() => setPartnerHistorySort((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
          >
            <Ionicons
              name={partnerHistorySort === 'desc' ? 'arrow-down' : 'arrow-up'}
              size={13}
              color={isDark ? '#93c5fd' : '#1d4ed8'}
            />
            <Text style={[styles.partnerSortToggleText, !isDark && styles.partnerSortToggleTextLight]}>
              {partnerHistorySort === 'desc'
                ? (TRANSLATIONS[language].filterNewestFirst || 'Newest first')
                : (TRANSLATIONS[language].filterOldestFirst || 'Oldest first')}
            </Text>
            <Ionicons
              name="swap-vertical-outline"
              size={12}
              color={isDark ? '#60a5fa' : '#2563eb'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.settingsActionRow}>
          {[
            { id: 'all', label: TRANSLATIONS[language].filterAll || 'All' },
            { id: 'orders', label: TRANSLATIONS[language].historyFilterOrders || 'Orders' },
            { id: 'payouts', label: TRANSLATIONS[language].partnerPayoutRequest || 'Payouts' },
          ].map((option) => renderChip({
            id: `partner-history-filter-${option.id}`,
            label: option.label,
            isActive: partnerHistoryFilter === option.id,
            onPress: () => setPartnerHistoryFilter(option.id),
            compact: true,
          }))}
        </View>

        {visibleHistoryRows.length === 0 ? (
          <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
            {TRANSLATIONS[language].noResults || 'No results found'}
          </Text>
        ) : (
          visibleHistoryRows.map((item) => (
            <View key={item.id} style={styles.partnerRow}>
              <View style={styles.partnerRowMain}>
                <Text style={[styles.partnerRowTitle, !isDark && styles.textDark]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]} numberOfLines={1}>
                  {item.meta}
                </Text>
              </View>
              <View style={styles.partnerHistoryRight}>
                <Text style={[
                  styles.partnerAmount,
                  { color: item.sign === '-' ? '#ef4444' : '#22c55e' },
                ]}>
                  {item.sign}{formatAmount(item.amount)} {TRANSLATIONS[language].currencySom || 'som'}
                </Text>
                <View style={[styles.partnerStatusChip, { backgroundColor: `${statusColorMap[item.status] || '#64748b'}22` }]}>
                  <Text style={[styles.partnerStatusChipText, { color: statusColorMap[item.status] || '#64748b' }]}>
                    {item.statusLabel}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
        {canLoadMoreHistory && (
          <TouchableOpacity
            style={[styles.partnerLoadMoreBtn, !isDark && styles.settingsActionBtnLight]}
            onPress={() => setPartnerHistoryVisibleCount((prev) => prev + 12)}
          >
            <Text style={[styles.partnerLoadMoreText, !isDark && styles.settingsActionTextLight]}>
              {TRANSLATIONS[language].actionMore || 'Load more'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.settingsContentContainer || styles.settingsContainer}
      >
        {isPartner && partnerSettingsView === PARTNER_SETTINGS_VIEWS.EARNINGS
          ? renderPartnerEarningsSection()
          : renderPersonalSection()}
      </ScrollView>

      <Modal visible={Boolean(isPartner) && showPayoutModal} transparent animationType="fade" onRequestClose={closePayoutModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, !isDark && styles.cardLight]}>
            <Text style={[styles.modalTitle, !isDark && styles.textDark]}>
              {TRANSLATIONS[language].partnerPayoutRequest || 'Payout Request'}
            </Text>
            <Text style={[styles.modalSubtitle, !isDark && styles.textSecondary]}>
              {(TRANSLATIONS[language].partnerMinPayoutHint || 'Minimum payout')}: {minPayout} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
            <View style={styles.settingsActionRow}>
              {[
                {
                  id: 'min',
                  label: `${TRANSLATIONS[language].partnerMinPayoutHint || 'Min'} ${formatAmount(minPayout)}`,
                  value: minPayout,
                  disabled: minPayout > currentBalance,
                },
                {
                  id: 'half',
                  label: TRANSLATIONS[language].halfAmount || 'Half',
                  value: currentBalance / 2,
                  disabled: currentBalance <= 0,
                },
                {
                  id: 'all',
                  label: TRANSLATIONS[language].periodAll || 'All',
                  value: currentBalance,
                  disabled: currentBalance <= 0,
                },
              ].map((item) => (
                <TouchableOpacity
                  key={`quick-${item.id}`}
                  style={[
                    styles.settingsActionBtn,
                    !isDark && styles.partnerModalQuickBtnLight,
                    item.disabled && (isDark ? styles.bottomPublishBtnDisabled : styles.partnerModalQuickBtnDisabledLight),
                  ]}
                  onPress={() => setQuickAmount(item.value)}
                  disabled={item.disabled}
                >
                  <Text
                    style={[
                      styles.settingsActionText,
                      !isDark && styles.partnerModalQuickTextLight,
                      item.disabled && !isDark && styles.partnerModalQuickTextDisabledLight,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.partnerInput, !isDark && styles.inputLight]}
              keyboardType="numeric"
              placeholder={TRANSLATIONS[language].amountSom || 'Amount'}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={partnerPayoutAmount}
              onChangeText={(value) => {
                setPayoutTouched(true);
                setPayoutSubmitAttempted(false);
                setPartnerPayoutAmount?.(value);
              }}
            />
            <TextInput
              style={[styles.input, styles.partnerInput, styles.textArea, !isDark && styles.inputLight]}
              placeholder={TRANSLATIONS[language].notesOptional || 'Notes (optional)'}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={partnerPayoutNote}
              onChangeText={(value) => setPartnerPayoutNote?.(value)}
              multiline
            />
            {showPayoutValidation && (
              <Text style={styles.partnerValidationText}>{payoutValidationMessage}</Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalCancel,
                  !isDark && styles.modalCancelLight,
                  actionLoading && !isDark && styles.modalBtnDisabledLight,
                ]}
                onPress={closePayoutModal}
                disabled={actionLoading}
              >
                <Text style={[styles.modalCancelText, !isDark && styles.modalCancelTextLight]}>
                  {TRANSLATIONS[language].actionClose || 'Close'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  !isDark && styles.modalConfirmLight,
                  !canSubmitPayout && (isDark ? styles.bottomPublishBtnDisabled : styles.modalConfirmDisabledLight),
                ]}
                onPress={submitPayout}
                disabled={!canSubmitPayout}
              >
                <Text
                  style={[
                    styles.modalConfirmText,
                    !canSubmitPayout && !isDark && styles.modalConfirmTextDisabledLight,
                  ]}
                >
                  {actionLoading
                    ? (TRANSLATIONS[language].processing || 'Processing...')
                    : (TRANSLATIONS[language].partnerRequestNow || 'Request Payout')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

