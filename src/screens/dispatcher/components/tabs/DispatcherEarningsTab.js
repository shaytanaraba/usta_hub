import React, { useCallback, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const formatAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString();
};

const statusColorMap = {
  requested: '#f59e0b',
  paid: '#22c55e',
  rejected: '#ef4444',
};

export default function DispatcherEarningsTab({
  styles,
  isDark,
  translations,
  language,
  summary,
  requests,
  transactions,
  payoutAmount,
  setPayoutAmount,
  payoutNote,
  setPayoutNote,
  onSubmitPayout,
  loading,
  actionLoading,
}) {
  const TRANSLATIONS = translations;
  const sectionEarningsLabel = TRANSLATIONS[language].partnerEarnings
    || TRANSLATIONS[language].sectionEarnings
    || 'Earnings';
  const data = summary || {};
  const minPayout = Number(data.minPayout || 50);
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const pendingRequest = useMemo(
    () => (requests || []).find((item) => item.status === 'requested') || null,
    [requests]
  );
  const lastPaidRequest = useMemo(
    () => (requests || []).find((item) => item.status === 'paid') || null,
    [requests]
  );
  const pendingRequestedAmount = useMemo(
    () => (requests || [])
      .filter((item) => item.status === 'requested')
      .reduce((sum, item) => sum + Number(item.requested_amount || 0), 0),
    [requests]
  );
  const requestButtonDisabled = loading || actionLoading || Boolean(pendingRequest);

  const closePayoutModal = useCallback(() => {
    if (actionLoading) return;
    setShowPayoutModal(false);
  }, [actionLoading]);

  const openPayoutModal = useCallback(() => {
    if (requestButtonDisabled) return;
    setShowPayoutModal(true);
  }, [requestButtonDisabled]);

  const submitPayoutFromModal = useCallback(async () => {
    if (typeof onSubmitPayout !== 'function') return;
    const isSuccess = await onSubmitPayout();
    if (isSuccess) {
      setShowPayoutModal(false);
    }
  }, [onSubmitPayout]);

  return (
    <>
      <ScrollView style={styles.partnerEarningsContainer} contentContainerStyle={styles.partnerEarningsContent}>
        <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{sectionEarningsLabel}</Text>
          <Text style={[styles.partnerBalanceValue, !isDark && styles.textDark]}>
            {formatAmount(data.balance)} {TRANSLATIONS[language].currencySom || 'som'}
          </Text>
          <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
            {(TRANSLATIONS[language].commissionRate || 'Commission')}: {Number(data.commissionRatePercent || 0).toFixed(2)}%
          </Text>
          <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
            {(TRANSLATIONS[language].partnerMinPayoutHint || 'Minimum payout')}: {minPayout} {TRANSLATIONS[language].currencySom || 'som'}
          </Text>
          <TouchableOpacity
            style={[styles.partnerActionBtn, requestButtonDisabled && styles.bottomPublishBtnDisabled]}
            onPress={openPayoutModal}
            disabled={requestButtonDisabled}
          >
            <Text style={styles.partnerActionBtnText}>
              {pendingRequest
                ? (TRANSLATIONS[language].partnerPayoutPending || 'Payout request is already pending')
                : (TRANSLATIONS[language].partnerRequestNow || 'Request Payout')}
            </Text>
          </TouchableOpacity>
          {pendingRequest ? (
            <Text style={[styles.settingsHint, !isDark && styles.textSecondary]}>
              {(TRANSLATIONS[language].pending || 'Pending')}: {formatAmount(pendingRequest.requested_amount)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          ) : null}
        </View>

        <View style={styles.partnerMetricGrid}>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerEarned || 'Earned'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(data.earnedTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerPaidOut || 'Paid Out'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(data.paidTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerRequested || TRANSLATIONS[language].statusRequested || 'Requested'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(data.requestedTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].pending || 'Pending'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {Number(data.pendingRequests || 0)}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].deductions || 'Deductions'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(data.deductedTotal)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={[styles.partnerMetricCard, !isDark && styles.cardLight]}>
            <Text style={[styles.partnerMetricLabel, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].available || 'Available'}
            </Text>
            <Text style={[styles.partnerMetricValue, !isDark && styles.textDark]}>
              {formatAmount(data.balance)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
        </View>

        <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
            {TRANSLATIONS[language].overview || 'Overview'}
          </Text>
          <View style={styles.partnerRow}>
            <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerRequested || 'Requested (pending amount)'}
            </Text>
            <Text style={[styles.partnerRowTitle, !isDark && styles.textDark]}>
              {formatAmount(pendingRequestedAmount)} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
          </View>
          <View style={styles.partnerRow}>
            <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].partnerPaidOut || 'Last paid payout'}
            </Text>
            <Text style={[styles.partnerRowTitle, !isDark && styles.textDark]}>
              {lastPaidRequest
                ? `${formatAmount(lastPaidRequest.approved_amount || lastPaidRequest.requested_amount)} ${TRANSLATIONS[language].currencySom || 'som'}`
                : (TRANSLATIONS[language].noResults || 'No results found')}
            </Text>
          </View>
        </View>
        <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
            {TRANSLATIONS[language].partnerRequestsHistory || 'Payout Requests'}
          </Text>
          {(requests || []).length === 0 ? (
            <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].noResults || 'No results found'}
            </Text>
          ) : (
            (requests || []).slice(0, 20).map((item) => (
              <View key={item.id} style={styles.partnerRow}>
                <View style={styles.partnerRowMain}>
                  <Text style={[styles.partnerRowTitle, !isDark && styles.textDark]}>
                    {formatAmount(item.requested_amount)} {TRANSLATIONS[language].currencySom || 'som'}
                  </Text>
                  <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]}>
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Text>
                  {item.status === 'paid' && Number(item.approved_amount || 0) > 0 ? (
                    <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]}>
                      {(TRANSLATIONS[language].approved || 'Approved')}: {formatAmount(item.approved_amount)} {TRANSLATIONS[language].currencySom || 'som'}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.partnerStatusChip, { backgroundColor: `${statusColorMap[item.status] || '#64748b'}22` }]}>
                  <Text style={[styles.partnerStatusChipText, { color: statusColorMap[item.status] || '#64748b' }]}>
                    {item.status === 'paid'
                      ? (TRANSLATIONS[language].statusPaid || 'Paid')
                      : item.status === 'rejected'
                        ? (TRANSLATIONS[language].statusRejected || 'Rejected')
                        : (TRANSLATIONS[language].statusRequested || 'Requested')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
          <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>
            {TRANSLATIONS[language].history || 'History'}
          </Text>
          {(transactions || []).length === 0 ? (
            <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>
              {TRANSLATIONS[language].noResults || 'No results found'}
            </Text>
          ) : (
            (transactions || []).slice(0, 20).map((item) => (
              <View key={item.id} style={styles.partnerRow}>
                <View style={styles.partnerRowMain}>
                  <Text style={[styles.partnerRowTitle, !isDark && styles.textDark]}>
                    {item.transaction_type || 'transaction'}
                  </Text>
                  <Text style={[styles.partnerRowMeta, !isDark && styles.textSecondary]}>
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.partnerAmount,
                    { color: Number(item.amount) < 0 ? '#ef4444' : '#22c55e' },
                  ]}
                >
                  {Number(item.amount) < 0 ? '' : '+'}
                  {formatAmount(item.amount)} {TRANSLATIONS[language].currencySom || 'som'}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={showPayoutModal} transparent animationType="fade" onRequestClose={closePayoutModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, !isDark && styles.cardLight]}>
            <Text style={[styles.modalTitle, !isDark && styles.textDark]}>
              {TRANSLATIONS[language].partnerPayoutRequest || 'Payout Request'}
            </Text>
            <Text style={[styles.modalSubtitle, !isDark && styles.textSecondary]}>
              {(TRANSLATIONS[language].partnerMinPayoutHint || 'Minimum payout')}: {minPayout} {TRANSLATIONS[language].currencySom || 'som'}
            </Text>
            <TextInput
              style={[styles.input, styles.partnerInput, !isDark && styles.inputLight]}
              keyboardType="numeric"
              placeholder={TRANSLATIONS[language].amountSom || 'Amount'}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={payoutAmount}
              onChangeText={setPayoutAmount}
            />
            <TextInput
              style={[styles.input, styles.partnerInput, styles.textArea, !isDark && styles.inputLight]}
              placeholder={TRANSLATIONS[language].notesOptional || 'Notes (optional)'}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={payoutNote}
              onChangeText={setPayoutNote}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={closePayoutModal}
                disabled={actionLoading}
              >
                <Text style={styles.modalCancelText}>
                  {TRANSLATIONS[language].actionClose || 'Close'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (actionLoading || loading) && styles.bottomPublishBtnDisabled]}
                onPress={submitPayoutFromModal}
                disabled={actionLoading || loading}
              >
                <Text style={styles.modalConfirmText}>
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
