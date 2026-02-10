import React from 'react';
import { Animated, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';

export default function DispatcherStatsTab({
  styles,
  isDark,
  translations,
  language,
  statsRange,
  setStatsRange,
  statsWindowDays,
  statsWindowStart,
  statsWindowEnd,
  createdSeries,
  handledSeries,
  statsCreated,
  statsHandled,
  statsCompleted,
  statsCanceled,
  completionRate,
  cancelRate,
  statsDelta,
  statsColumns,
  statsGridWidth,
  setStatsGridWidth,
  statsTooltip,
  showStatsTooltip,
  hideStatsTooltip,
  updateStatsTooltipPos,
  statsInfo,
  setStatsInfo,
  getSeriesMeta,
  formatShortDate,
  SCREEN_WIDTH,
  loading,
  skeletonPulse,
}) {
  const TRANSLATIONS = translations;
  const createdMeta = getSeriesMeta(createdSeries);
  const handledMeta = getSeriesMeta(handledSeries);
  const createdMax = Math.max(1, createdMeta.max);
  const handledMax = Math.max(1, handledMeta.max);
  const emptyCreated = createdMeta.total === 0;
  const emptyHandled = handledMeta.total === 0;
  const activeDays = createdSeries.filter((v) => v > 0).length;
  const dateRangeLabel = `${formatShortDate(statsWindowStart)} - ${formatShortDate(statsWindowEnd)}`;

  const statsInfoContent = {
    created: {
      title: TRANSLATIONS[language].statsInfoCreatedTitle || 'Created',
      summary: TRANSLATIONS[language].statsInfoCreatedText || 'Orders created by you in this period.',
      factors: TRANSLATIONS[language].statsInfoCreatedFactors || 'Factors: demand volume, response time, intake availability.',
      improve: TRANSLATIONS[language].statsInfoCreatedImprove || 'Improve intake speed and clarity to create more valid requests.',
      details: TRANSLATIONS[language].statsInfoCreatedDetails || 'See Orders > Created filter.',
    },
    handled: {
      title: TRANSLATIONS[language].statsInfoHandledTitle || 'Handled',
      summary: TRANSLATIONS[language].statsInfoHandledText || 'Orders currently assigned to you (created or transferred).',
      factors: TRANSLATIONS[language].statsInfoHandledFactors || 'Factors: transfers, workload, working hours.',
      improve: TRANSLATIONS[language].statsInfoHandledImprove || 'Keep updates timely and avoid unnecessary reassignments.',
      details: TRANSLATIONS[language].statsInfoHandledDetails || 'See Orders > My orders.',
    },
    completed: {
      title: TRANSLATIONS[language].statsInfoCompletedTitle || 'Completed',
      summary: TRANSLATIONS[language].statsInfoCompletedText || 'Orders completed by masters after your handling.',
      factors: TRANSLATIONS[language].statsInfoCompletedFactors || 'Factors: master availability, correct scope, client response.',
      improve: TRANSLATIONS[language].statsInfoCompletedImprove || 'Confirm details and follow up to reduce drop-offs.',
      details: TRANSLATIONS[language].statsInfoCompletedDetails || 'See Orders > Completed filter.',
    },
    canceled: {
      title: TRANSLATIONS[language].statsInfoCanceledTitle || 'Canceled',
      summary: TRANSLATIONS[language].statsInfoCanceledText || 'Orders canceled by client/master/system.',
      factors: TRANSLATIONS[language].statsInfoCanceledFactors || 'Factors: wrong address, pricing mismatch, no-show.',
      improve: TRANSLATIONS[language].statsInfoCanceledImprove || 'Reduce errors by confirming address, scope, and urgency.',
      details: TRANSLATIONS[language].statsInfoCanceledDetails || 'See Orders > Canceled filter.',
    },
    completionRate: {
      title: TRANSLATIONS[language].statsInfoCompletionTitle || 'Completion rate',
      summary: TRANSLATIONS[language].statsInfoCompletionText || 'Completed / Created for this period.',
      factors: TRANSLATIONS[language].statsInfoCompletionFactors || 'Factors: cancellations, reopens, and client response time.',
      improve: TRANSLATIONS[language].statsInfoCompletionImprove || 'Improve intake quality and reduce rework.',
      details: TRANSLATIONS[language].statsInfoCompletionDetails || 'Compare Created vs Completed in filters.',
    },
    cancelRate: {
      title: TRANSLATIONS[language].statsInfoCancelTitle || 'Cancel rate',
      summary: TRANSLATIONS[language].statsInfoCancelText || 'Canceled / Created for this period.',
      factors: TRANSLATIONS[language].statsInfoCancelFactors || 'Factors: no-shows, unclear scope, long response times.',
      improve: TRANSLATIONS[language].statsInfoCancelImprove || 'Clarify scope early and reduce no-shows.',
      details: TRANSLATIONS[language].statsInfoCancelDetails || 'Check cancellation reasons in order details.',
    },
  };

  const statCards = [
    { key: 'created', label: TRANSLATIONS[language].dispatcherStatsCreated || 'Created', value: statsCreated, delta: statsDelta.created },
    { key: 'handled', label: TRANSLATIONS[language].dispatcherStatsHandled || 'Handled', value: statsHandled, delta: statsDelta.handled },
    { key: 'completed', label: TRANSLATIONS[language].dispatcherStatsCompleted || 'Completed', value: statsCompleted, delta: statsDelta.completed },
    { key: 'canceled', label: TRANSLATIONS[language].dispatcherStatsCanceled || 'Canceled', value: statsCanceled, delta: statsDelta.canceled },
    { key: 'completionRate', label: TRANSLATIONS[language].dispatcherStatsCompletionRate || 'Completion rate', value: `${completionRate}%`, delta: null },
    { key: 'cancelRate', label: TRANSLATIONS[language].dispatcherStatsCancelRate || 'Cancel rate', value: `${cancelRate}%`, delta: null },
  ];

  const getEventPos = (event) => {
    const native = event?.nativeEvent || {};
    const x = native.pageX ?? native.locationX ?? 0;
    const y = native.pageY ?? native.locationY ?? 0;
    return { x, y };
  };

  const renderDots = (series, maxValue, color, kind, avgValue) => (
    <View style={styles.statsTrendArea}>
      <View style={styles.statsTrendGrid}>
        <View style={styles.statsTrendGridLine} />
        <View style={styles.statsTrendGridLine} />
      </View>
      <View style={styles.statsTrendYAxis}>
        <Text style={[styles.statsTrendAxisText, !isDark && styles.statsTrendAxisTextLight]}>{maxValue}</Text>
        <Text style={[styles.statsTrendAxisText, !isDark && styles.statsTrendAxisTextLight]}>0</Text>
      </View>
      <View style={styles.statsTrendDots}>
        {series.map((value, index) => {
          const pct = maxValue === 0 ? 0 : value / maxValue;
          const dotSize = 6 + Math.round(pct * 6);
          const offset = Math.round(pct * (72 - dotSize));
          const dotDate = new Date(statsWindowStart.getTime() + (index * 24 * 60 * 60 * 1000));
          const showAt = (event, resetTimer = true) => {
            const pos = getEventPos(event);
            showStatsTooltip({ kind, value, date: dotDate, x: pos.x, y: pos.y }, resetTimer);
          };
          return (
            <View key={`${color}-${index}`} style={styles.statsTrendSlot}>
              <TouchableOpacity
                onPress={(event) => showAt(event, true)}
                onMouseEnter={Platform.OS === 'web' ? (event) => showAt(event, true) : undefined}
                onMouseMove={Platform.OS === 'web'
                  ? (event) => {
                    if (!statsTooltip) {
                      showAt(event, true);
                      return;
                    }
                    const pos = getEventPos(event);
                    updateStatsTooltipPos(pos.x, pos.y);
                  }
                  : undefined}
                onMouseLeave={Platform.OS === 'web' ? hideStatsTooltip : undefined}
                style={[
                  styles.statsTrendDot,
                  { width: dotSize, height: dotSize, backgroundColor: color, marginBottom: Math.max(0, offset) },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={[styles.statsAvgLine, { top: 6 + (72 - (maxValue ? (avgValue / maxValue) * 72 : 0)) }]} />
      <View style={styles.statsTrendAxis}>
        <Text style={[styles.statsTrendAxisText, !isDark && styles.statsTrendAxisTextLight]}>{formatShortDate(statsWindowStart)}</Text>
        <Text style={[styles.statsTrendAxisText, !isDark && styles.statsTrendAxisTextLight]}>{formatShortDate(new Date((statsWindowStart.getTime() + statsWindowEnd.getTime()) / 2))}</Text>
        <Text style={[styles.statsTrendAxisText, !isDark && styles.statsTrendAxisTextLight]}>{formatShortDate(statsWindowEnd)}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.statsContainer}>
        <Animated.View
          style={[
            styles.skeletonCard,
            !isDark && styles.skeletonCardLight,
            { opacity: skeletonPulse },
          ]}
        >
          <View style={styles.skeletonHeaderRow}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineShort} />
          </View>
          <View style={styles.skeletonLineMid} />
          <View style={styles.skeletonLineFull} />
        </Animated.View>

        <View style={styles.statsCards}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Animated.View
              key={`stats-skeleton-card-${index}`}
              style={[
                styles.statsCard,
                !isDark && styles.cardLight,
                { opacity: skeletonPulse },
              ]}
            >
              <View style={styles.skeletonLineMid} />
              <View style={[styles.skeletonLineWide, { marginTop: 10 }]} />
              <View style={[styles.skeletonLineShort, { marginTop: 8 }]} />
            </Animated.View>
          ))}
        </View>

        {Array.from({ length: 2 }).map((_, index) => (
          <Animated.View
            key={`stats-skeleton-chart-${index}`}
            style={[
              styles.skeletonCard,
              !isDark && styles.skeletonCardLight,
              { opacity: skeletonPulse },
            ]}
          >
            <View style={styles.skeletonHeaderRow}>
              <View style={styles.skeletonLineWide} />
              <View style={styles.skeletonLineShort} />
            </View>
            <View style={[styles.skeletonLineFull, { marginBottom: 8 }]} />
            <View style={[styles.skeletonLineFull, { marginBottom: 8 }]} />
            <View style={styles.skeletonLineFull} />
          </Animated.View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statsHeader}>
        <Text style={[styles.statsTitle, !isDark && styles.textDark]}>
          {TRANSLATIONS[language].dispatcherStatsTitle || 'Dispatcher Stats'}
        </Text>
        <View style={styles.statsRangeRow}>
          <TouchableOpacity
            style={[styles.statsRangeBtn, statsRange === 'week' && styles.statsRangeBtnActive, !isDark && styles.statsRangeBtnLight, !isDark && statsRange === 'week' && styles.statsRangeBtnActiveLight]}
            onPress={() => setStatsRange('week')}
          >
            <Text style={[styles.statsRangeText, statsRange === 'week' && styles.statsRangeTextActive, !isDark && styles.statsRangeTextLight, !isDark && statsRange === 'week' && styles.statsRangeTextActiveLight]}>
              {TRANSLATIONS[language].dispatcherStatsRangeWeek || 'Week'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statsRangeBtn, statsRange === 'month' && styles.statsRangeBtnActive, !isDark && styles.statsRangeBtnLight, !isDark && statsRange === 'month' && styles.statsRangeBtnActiveLight]}
            onPress={() => setStatsRange('month')}
          >
            <Text style={[styles.statsRangeText, statsRange === 'month' && styles.statsRangeTextActive, !isDark && styles.statsRangeTextLight, !isDark && statsRange === 'month' && styles.statsRangeTextActiveLight]}>
              {TRANSLATIONS[language].dispatcherStatsRangeMonth || 'Month'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRangeInfo}>
        <Text style={[styles.statsRangeLabel, !isDark && styles.statsRangeLabelLight]}>
          {(TRANSLATIONS[language].dispatcherStatsRangeLabel || 'Range')}: {dateRangeLabel}
        </Text>
        <View style={styles.statsRangeBadges}>
          <View style={[styles.statsBadge, !isDark && styles.statsBadgeLight]}>
            <Text style={[styles.statsBadgeText, !isDark && styles.statsBadgeTextLight]}>
              {TRANSLATIONS[language].dispatcherStatsActiveDays || 'Active days'}: {activeDays}
            </Text>
          </View>
          {activeDays <= Math.ceil(statsWindowDays / 3) && (
            <View style={[styles.statsBadgeMuted, !isDark && styles.statsBadgeMutedLight]}>
              <Text style={[styles.statsBadgeMutedText, !isDark && styles.statsBadgeMutedTextLight]}>
                {TRANSLATIONS[language].dispatcherStatsQuiet || 'Quiet period'}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.statsHintText, !isDark && styles.textSecondary]}>
        {TRANSLATIONS[language].statsInfoHint || 'Tap a metric card for details'}
      </Text>

      <View style={styles.statsCards} onLayout={(event) => setStatsGridWidth(event.nativeEvent.layout.width)}>
        {statCards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={[
              styles.statsCard,
              !isDark && styles.cardLight,
              statsGridWidth > 0 && { width: Math.floor((statsGridWidth - (statsColumns - 1) * 10) / statsColumns) },
            ]}
            activeOpacity={0.85}
            onPress={() => setStatsInfo(statsInfoContent[card.key])}
          >
            <Text style={styles.statsCardLabel}>{card.label}</Text>
            <Text style={[styles.statsCardValue, !isDark && styles.textDark]}>{card.value}</Text>
            {card.delta !== null && (
              <Text style={[styles.statsCardDelta, card.delta >= 0 ? styles.statsDeltaUp : styles.statsDeltaDown]}>
                {card.delta >= 0 ? '+' : ''}{card.delta}% {TRANSLATIONS[language].dispatcherStatsDelta || 'vs prev'}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsCharts}>
        <View style={[styles.statsChartCard, !isDark && styles.cardLight]}>
          <View style={styles.statsChartHeader}>
            <Text style={styles.statsChartTitle}>{TRANSLATIONS[language].dispatcherStatsTrendCreated || 'Created trend'}</Text>
            <Text style={styles.statsChartMeta}>
              {(TRANSLATIONS[language].dispatcherStatsAvgPerDay || 'Avg/day')}: {createdMeta.avg.toFixed(1)} · {(TRANSLATIONS[language].analyticsMax || 'Max')}: {createdMeta.max}
            </Text>
          </View>
          {emptyCreated
            ? <Text style={styles.statsEmptyText}>{TRANSLATIONS[language].analyticsEmpty || 'No activity in this period'}</Text>
            : renderDots(createdSeries, createdMax, '#3b82f6', 'created', createdMeta.avg)}
        </View>
        <View style={[styles.statsChartCard, !isDark && styles.cardLight]}>
          <View style={styles.statsChartHeader}>
            <Text style={styles.statsChartTitle}>{TRANSLATIONS[language].dispatcherStatsTrendHandled || 'Handled trend'}</Text>
            <Text style={styles.statsChartMeta}>
              {(TRANSLATIONS[language].dispatcherStatsAvgPerDay || 'Avg/day')}: {handledMeta.avg.toFixed(1)} · {(TRANSLATIONS[language].analyticsMax || 'Max')}: {handledMeta.max}
            </Text>
          </View>
          {emptyHandled
            ? <Text style={styles.statsEmptyText}>{TRANSLATIONS[language].analyticsEmpty || 'No activity in this period'}</Text>
            : renderDots(handledSeries, handledMax, '#22c55e', 'handled', handledMeta.avg)}
        </View>
      </View>

      {statsTooltip && (
        <View
          style={[
            styles.statsTooltip,
            !isDark && styles.statsTooltipLight,
            statsTooltip?.x != null && statsTooltip?.y != null
              ? (() => {
                if (Platform.OS !== 'web') return { left: 16, right: 16, bottom: 16 };
                const tooltipW = 220;
                const tooltipH = 120;
                const padding = 12;
                const viewportW = typeof window !== 'undefined' ? window.innerWidth : SCREEN_WIDTH;
                const viewportH = typeof window !== 'undefined' ? window.innerHeight : 600;
                let left = statsTooltip.x + 12;
                let top = statsTooltip.y + 12;
                if (left + tooltipW + padding > viewportW) left = statsTooltip.x - tooltipW - 12;
                if (top + tooltipH + padding > viewportH) top = statsTooltip.y - tooltipH - 12;
                left = Math.max(padding, Math.min(left, viewportW - tooltipW - padding));
                top = Math.max(padding, Math.min(top, viewportH - tooltipH - padding));
                return { position: 'fixed', left, top };
              })()
              : { right: 16, bottom: 16 },
          ]}
        >
          <Text style={[styles.statsTooltipTitle, !isDark && styles.textDark]}>
            {statsTooltip.kind === 'created'
              ? (TRANSLATIONS[language].dispatcherStatsTrendCreated || 'Created trend')
              : (TRANSLATIONS[language].dispatcherStatsTrendHandled || 'Handled trend')}
          </Text>
          <Text style={[styles.statsTooltipText, !isDark && styles.textSecondary]}>
            {(TRANSLATIONS[language].dispatcherStatsTooltipDate || 'Date')}: {formatShortDate(statsTooltip.date)}
          </Text>
          <Text style={[styles.statsTooltipText, !isDark && styles.textSecondary]}>
            {(TRANSLATIONS[language].dispatcherStatsTooltipValue || 'Orders')}: {statsTooltip.value}
          </Text>
        </View>
      )}

      {statsInfo && (
        <Modal transparent visible onRequestClose={() => setStatsInfo(null)}>
          <View style={styles.statsInfoOverlay}>
            <View style={[styles.statsInfoCard, !isDark && styles.cardLight]}>
              <Text style={[styles.statsInfoTitle, !isDark && styles.textDark]}>{statsInfo.title}</Text>
              <Text style={[styles.statsInfoText, !isDark && styles.textSecondary]}>{statsInfo.summary}</Text>
              {statsInfo.factors && (
                <>
                  <Text style={[styles.statsInfoSection, !isDark && styles.textSecondary]}>
                    {TRANSLATIONS[language].statsInfoFactorsLabel || 'Factors'}
                  </Text>
                  <Text style={[styles.statsInfoText, !isDark && styles.textSecondary]}>{statsInfo.factors}</Text>
                </>
              )}
              <Text style={[styles.statsInfoSection, !isDark && styles.textSecondary]}>
                {TRANSLATIONS[language].statsInfoImproveLabel || 'How to improve'}
              </Text>
              <Text style={[styles.statsInfoText, !isDark && styles.textSecondary]}>{statsInfo.improve}</Text>
              <Text style={[styles.statsInfoSection, !isDark && styles.textSecondary]}>
                {TRANSLATIONS[language].statsInfoDetailsLabel || 'Where to see details'}
              </Text>
              <Text style={[styles.statsInfoText, !isDark && styles.textSecondary]}>{statsInfo.details}</Text>
              <TouchableOpacity style={styles.statsInfoCloseBtn} onPress={() => setStatsInfo(null)}>
                <Text style={styles.statsInfoCloseText}>{TRANSLATIONS[language].actionClose || 'Close'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
