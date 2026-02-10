import React from 'react';
import { Dimensions, FlatList, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { URGENCY_OPTIONS } from '../config/constants';
import {
    AnalyticsListCard,
    AnalyticsMetricCard,
    BoxPlotChart,
    COMPLETED_STATUSES,
    DAY_MS,
    formatMoney,
    formatNumber,
    formatPercent,
    formatShortDate,
    getAnalyticsColumns,
    getPointerPos,
    InfoTip,
    LabeledBarChart,
    normalizeStatus,
    StatusPie,
    StatusStrip,
} from '../components/analyticsShared';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AdminAnalyticsTab(props) {
    const {
        TRANSLATIONS,
        analyticsAreaOptions,
        analyticsChartSeries,
        analyticsCustomRange,
        analyticsDailySeries,
        analyticsDetail,
        analyticsDispatcherId,
        analyticsDispatcherOptions,
        analyticsDispatcherStats,
        analyticsDispatchers,
        analyticsFilters,
        analyticsGranularity,
        analyticsInfoHandlers,
        analyticsLists,
        analyticsLocale,
        analyticsMasterId,
        analyticsMasterOptions,
        analyticsMasterStats,
        analyticsPeople,
        analyticsRange,
        analyticsSection,
        analyticsStats,
        analyticsTooltip,
        analyticsTrendTooltip,
        dispatcherCreatedMeta,
        dispatcherCreatedSeries,
        dispatcherHandledMeta,
        dispatcherHandledSeries,
        dispatcherStatusBreakdown,
        dispatcherTrendWindow,
        hideAnalyticsTrendTooltip,
        hidePriceDistTooltip,
        isDark,
        isWeb,
        masterCompletedMeta,
        masterCompletedSeries,
        masterRevenueMeta,
        masterRevenueSeries,
        masterStatusBreakdown,
        masterTrendWindow,
        openAnalyticsOrdersModal,
        priceDistChartWidth,
        priceDistData,
        priceDistGrouping,
        priceDistGroupingNotice,
        priceDistGroupingRules,
        priceDistRange,
        priceDistScope,
        priceDistTooltip,
        renderHeader,
        serviceFilterOptions,
        setAnalyticsCustomRange,
        setAnalyticsDetail,
        setAnalyticsDispatcherId,
        setAnalyticsFilters,
        setAnalyticsGranularity,
        setAnalyticsMasterId,
        setAnalyticsRange,
        setAnalyticsSection,
        setPickerModal,
        setPriceDistChartWidth,
        setPriceDistGrouping,
        setPriceDistRange,
        setPriceDistScope,
        setShowAnalyticsEndPicker,
        setShowAnalyticsStartPicker,
        showAnalyticsEndPicker,
        showAnalyticsStartPicker,
        showAnalyticsTrendTooltip,
        showPriceDistTooltip,
        styles,
        updateAnalyticsTrendTooltipPos,
        updatePriceDistTooltipPos,
    } = props;
    const [statusMixTooltip, setStatusMixTooltip] = React.useState(null);
    const [priceDistMetricTooltip, setPriceDistMetricTooltip] = React.useState(null);
    const columns = getAnalyticsColumns();
        const cardWidth = columns === 1 ? '100%' : columns === 2 ? '48%' : '31%';
        const listWidth = columns === 1 ? '100%' : '48%';
        const showClearFilters = analyticsFilters.urgency !== 'all' || analyticsFilters.service !== 'all' || analyticsFilters.area !== 'all';
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
        const priceDistRangeOptions = [
            { key: '7d', label: '7D' },
            { key: '30d', label: '30D' },
            { key: '90d', label: '90D' },
            { key: 'ytd', label: TRANSLATIONS.analyticsPriceDistributionRangeYTD || 'YTD' },
            { key: 'all', label: TRANSLATIONS.analyticsPriceDistributionRangeAll || TRANSLATIONS.filterAll || 'All' },
        ];
        const priceDistGroupingOptions = [
            { key: 'day', label: TRANSLATIONS.analyticsPriceDistributionDaily || 'Daily' },
            { key: 'week', label: TRANSLATIONS.analyticsPriceDistributionWeekly || 'Weekly' },
            { key: 'month', label: TRANSLATIONS.analyticsPriceDistributionMonthly || 'Monthly' },
        ];
        const priceDistScopeOptions = [
            { key: 'completed', label: TRANSLATIONS.analyticsPriceDistributionScopeCompleted || 'Completed' },
            { key: 'all', label: TRANSLATIONS.analyticsPriceDistributionScopeAll || 'All orders' },
        ];
        const allowedGroupings = priceDistGroupingRules[priceDistRange] || ['week'];
        const priceDistSummary = priceDistData?.summary || {};
        const formatMoneyCurrency = (value) => (Number.isFinite(value) ? `${formatMoney(value)} ${TRANSLATIONS.currency || 'som'}` : '-');
        const formatPriceDistStat = (value) => (priceDistSummary.n ? formatMoneyCurrency(value) : '-');
        const priceDistYAxisLabel = `${TRANSLATIONS.analyticsPriceDistributionMetricPrice || 'Order price'}\n(${TRANSLATIONS.currency || 'som'})`;
        const priceDistTicks = [
            priceDistSummary.max,
            priceDistSummary.mean,
            priceDistSummary.p75,
            priceDistSummary.p50,
            priceDistSummary.p25,
            priceDistSummary.min,
        ].filter(val => Number.isFinite(val) && val >= 0);
        const formatBucketRangeLabel = (bucket) => {
            if (!bucket?.start) return bucket?.label || '-';
            if (priceDistGrouping === 'day') return formatShortDate(bucket.start, analyticsLocale);
            return `${formatShortDate(bucket.start, analyticsLocale)} - ${formatShortDate(bucket.end, analyticsLocale)}`;
        };
        const getVolatilityLabel = (cv) => {
            if (!priceDistSummary?.n) return '-';
            if (!Number.isFinite(cv)) return '-';
            if (cv < 0.3) return TRANSLATIONS.analyticsPriceDistributionStabilityHigh || 'High stability';
            if (cv < 0.6) return TRANSLATIONS.analyticsPriceDistributionStabilityModerate || 'Moderate stability';
            return TRANSLATIONS.analyticsPriceDistributionStabilityLow || 'Low stability';
        };
        const priceDistStatTips = {
            n: TRANSLATIONS.analyticsPriceDistributionNTip || 'Number of orders in this range and scope.',
            median: TRANSLATIONS.analyticsPriceDistributionMedianTip || 'Middle price (50th percentile). Half of orders are below, half above.',
            p25: TRANSLATIONS.analyticsPriceDistributionP25Tip || '25th percentile. 25% of orders are below this value.',
            p75: TRANSLATIONS.analyticsPriceDistributionP75Tip || '75th percentile. 75% of orders are below this value.',
            top10: TRANSLATIONS.analyticsPriceDistributionTop10Tip || '90th percentile (top 10% threshold).',
            mean: TRANSLATIONS.analyticsPriceDistributionMeanTip || 'Average order price.',
            std: TRANSLATIONS.analyticsPriceDistributionStdTip || 'Standard deviation. Higher values mean prices vary more.',
            iqr: TRANSLATIONS.analyticsPriceDistributionIQRTip || 'Interquartile range (P75 - P25). Core spread of typical prices.',
            min: TRANSLATIONS.analyticsPriceDistributionMinTip || 'Lowest order price in this range.',
            max: TRANSLATIONS.analyticsPriceDistributionMaxTip || 'Highest order price in this range.',
            p90: TRANSLATIONS.analyticsPriceDistributionP90Tip || '90th percentile. Most orders are below this value.',
            stability: TRANSLATIONS.analyticsPriceDistributionStabilityTip || 'Derived from coefficient of variation (STD / mean). Lower is more stable.',
        };
        const priceDistStatItems = [
            {
                key: 'n',
                label: TRANSLATIONS.analyticsPriceDistributionN || 'N',
                value: formatNumber(priceDistSummary.n),
                infoText: priceDistStatTips.n,
            },
            {
                key: 'median',
                label: TRANSLATIONS.analyticsPriceDistributionMedian || 'Median',
                value: formatPriceDistStat(priceDistSummary.p50),
                primary: true,
                infoText: priceDistStatTips.median,
            },
            {
                key: 'p25',
                label: TRANSLATIONS.analyticsPriceDistributionP25 || 'P25',
                value: formatPriceDistStat(priceDistSummary.p25),
                infoText: priceDistStatTips.p25,
            },
            {
                key: 'p75',
                label: TRANSLATIONS.analyticsPriceDistributionP75 || 'P75',
                value: formatPriceDistStat(priceDistSummary.p75),
                infoText: priceDistStatTips.p75,
            },
            {
                key: 'top10',
                label: TRANSLATIONS.analyticsPriceDistributionTop10Label || 'Top 10% jobs',
                value: formatPriceDistStat(priceDistSummary.p90),
                infoText: priceDistStatTips.top10,
            },
            {
                key: 'mean',
                label: TRANSLATIONS.analyticsPriceDistributionMean || 'Mean',
                value: formatPriceDistStat(priceDistSummary.mean),
                infoText: priceDistStatTips.mean,
            },
            {
                key: 'std',
                label: TRANSLATIONS.analyticsPriceDistributionStd || 'STD',
                value: formatPriceDistStat(priceDistSummary.std),
                infoText: priceDistStatTips.std,
            },
            {
                key: 'iqr',
                label: TRANSLATIONS.analyticsPriceDistributionIQR || 'IQR',
                value: formatPriceDistStat(priceDistSummary.iqr),
                infoText: priceDistStatTips.iqr,
            },
            {
                key: 'min',
                label: TRANSLATIONS.analyticsPriceDistributionMin || 'Min',
                value: formatPriceDistStat(priceDistSummary.min),
                infoText: priceDistStatTips.min,
            },
            {
                key: 'max',
                label: TRANSLATIONS.analyticsPriceDistributionMax || 'Max',
                value: formatPriceDistStat(priceDistSummary.max),
                infoText: priceDistStatTips.max,
            },
            {
                key: 'p90',
                label: TRANSLATIONS.analyticsPriceDistributionP90 || 'P90',
                value: formatPriceDistStat(priceDistSummary.p90),
                infoText: priceDistStatTips.p90,
            },
            {
                key: 'stability',
                label: TRANSLATIONS.analyticsPriceDistributionStability || 'Stability',
                value: priceDistSummary.n
                    ? `${getVolatilityLabel(priceDistSummary.cv)} (${formatPercent(priceDistSummary.cv)})`
                    : '-',
                infoText: priceDistStatTips.stability,
            },
        ];
        const overviewStatusSegments = [
            { label: TRANSLATIONS.analyticsOpenOrders || 'Open', value: analyticsStats.statusBreakdown.open, color: '#38bdf8' },
            { label: TRANSLATIONS.analyticsActiveJobs || 'Active', value: analyticsStats.statusBreakdown.active, color: '#3b82f6' },
            { label: TRANSLATIONS.analyticsCompleted || 'Completed', value: analyticsStats.statusBreakdown.completed, color: '#22c55e' },
            { label: TRANSLATIONS.analyticsCanceled || 'Canceled', value: analyticsStats.statusBreakdown.canceled, color: '#ef4444' },
        ];
        const dispatcherStatusSegments = [
            { label: TRANSLATIONS.analyticsOpenOrders || 'Open', value: dispatcherStatusBreakdown.open, color: '#38bdf8' },
            { label: TRANSLATIONS.analyticsActiveJobs || 'Active', value: dispatcherStatusBreakdown.active, color: '#3b82f6' },
            { label: TRANSLATIONS.analyticsCompleted || 'Completed', value: dispatcherStatusBreakdown.completed, color: '#22c55e' },
            { label: TRANSLATIONS.analyticsCanceled || 'Canceled', value: dispatcherStatusBreakdown.canceled, color: '#ef4444' },
        ];
        const masterStatusSegments = [
            { label: TRANSLATIONS.analyticsOpenOrders || 'Open', value: masterStatusBreakdown.open, color: '#38bdf8' },
            { label: TRANSLATIONS.analyticsActiveJobs || 'Active', value: masterStatusBreakdown.active, color: '#3b82f6' },
            { label: TRANSLATIONS.analyticsCompleted || 'Completed', value: masterStatusBreakdown.completed, color: '#22c55e' },
            { label: TRANSLATIONS.analyticsCanceled || 'Canceled', value: masterStatusBreakdown.canceled, color: '#ef4444' },
        ];
        const resolveFloatingTooltipStyle = React.useCallback((x, y, tooltipW, tooltipH) => {
            if (Platform.OS !== 'web' || x == null || y == null) {
                return { right: 16, bottom: 16 };
            }
            const edgePad = 8;
            const cursorPad = 12;
            const viewportW = typeof window !== 'undefined' ? window.innerWidth : SCREEN_WIDTH;
            const viewportH = typeof window !== 'undefined' ? window.innerHeight : 600;
            let left = x + cursorPad;
            if (left + tooltipW + edgePad > viewportW) {
                left = x - tooltipW - cursorPad;
            }
            let top = y + cursorPad;
            if (top + tooltipH + edgePad > viewportH) {
                top = y - tooltipH - cursorPad;
            }
            left = Math.max(edgePad, Math.min(left, viewportW - tooltipW - edgePad));
            top = Math.max(edgePad, Math.min(top, viewportH - tooltipH - edgePad));
            return { position: 'fixed', left, top, width: tooltipW };
        }, []);
        const showStatusMixTooltip = React.useCallback((segment, event) => {
            if (!segment?.label) return;
            const pos = event ? getPointerPos(event) : { x: null, y: null };
            setStatusMixTooltip({
                ...segment,
                x: pos.x,
                y: pos.y,
            });
        }, []);
        const updateStatusMixTooltipPos = React.useCallback((segment, event) => {
            if (!event) return;
            const pos = getPointerPos(event);
            setStatusMixTooltip(prev => {
                if (!prev) return prev;
                return {
                    ...(segment?.label ? { ...prev, ...segment } : prev),
                    x: pos.x,
                    y: pos.y,
                };
            });
        }, []);
        const hideStatusMixTooltip = React.useCallback(() => {
            setStatusMixTooltip(null);
        }, []);
        const showPriceDistMetricTooltip = React.useCallback((item, event) => {
            if (!item?.label) return;
            const pos = event ? getPointerPos(event) : { x: null, y: null };
            setPriceDistMetricTooltip({
                title: item.label,
                value: item.value,
                infoText: item.infoText,
                x: pos.x,
                y: pos.y,
            });
        }, []);
        const updatePriceDistMetricTooltipPos = React.useCallback((event) => {
            if (!event) return;
            const pos = getPointerPos(event);
            setPriceDistMetricTooltip(prev => (prev ? { ...prev, x: pos.x, y: pos.y } : prev));
        }, []);
        const hidePriceDistMetricTooltip = React.useCallback(() => {
            setPriceDistMetricTooltip(null);
        }, []);
        const handlePriceDistHover = (bucket, event) => {
            if (!bucket?.stats?.n) return;
            const stats = bucket.stats;
            const { x, y } = getPointerPos(event);
            showPriceDistTooltip({
                title: formatBucketRangeLabel(bucket),
                n: stats.n,
                min: stats.min,
                p25: stats.p25,
                p50: stats.p50,
                p75: stats.p75,
                max: stats.max,
                mean: stats.mean,
                std: stats.std,
                p90: stats.p90,
                smallSample: bucket.smallSample,
                x,
                y,
            });
        };
        const handlePriceDistMove = (event) => {
            const { x, y } = getPointerPos(event);
            updatePriceDistTooltipPos(x, y);
        };
        const handlePriceDistLeave = () => hidePriceDistTooltip();
        const handlePriceDistPress = (bucket, event) => {
            if (!bucket?.orders?.length) return;
            if (Platform.OS !== 'web') {
                handlePriceDistHover(bucket, event);
            }
            const title = `${TRANSLATIONS.analyticsPriceDistributionOrders || 'Orders'} - ${formatBucketRangeLabel(bucket)}`;
            openAnalyticsOrdersModal(title, null, bucket.orders);
        };

        const urgencyOptions = URGENCY_OPTIONS.map(opt => ({
            id: opt.id,
            label: TRANSLATIONS[opt.label] || opt.label,
        }));

        const currentUrgencyLabel = urgencyOptions.find(o => o.id === analyticsFilters.urgency)?.label || analyticsFilters.urgency;
        const currentServiceLabel = serviceFilterOptions.find(o => o.id === analyticsFilters.service)?.label || analyticsFilters.service;
        const currentAreaLabel = analyticsAreaOptions.find(o => o.id === analyticsFilters.area)?.label || analyticsFilters.area;
        const currentDispatcherLabel = analyticsDispatcherOptions.find(o => o.id === analyticsDispatcherId)?.label
            || (analyticsDispatcherId === 'all' ? (TRANSLATIONS.analyticsAllDispatchers || 'All dispatchers') : analyticsDispatcherId);
        const currentMasterLabel = analyticsMasterOptions.find(o => o.id === analyticsMasterId)?.label
            || (analyticsMasterId === 'all' ? (TRANSLATIONS.analyticsAllMasters || 'All masters') : analyticsMasterId);
        const showPeopleFilter = analyticsSection === 'dispatchers' || analyticsSection === 'masters';

        const detailTitleMap = {
            topAreas: TRANSLATIONS.analyticsTopAreas || 'Top Areas',
            topServices: TRANSLATIONS.analyticsTopServices || 'Top Services',
            urgencyMix: TRANSLATIONS.analyticsUrgencyMix || 'Urgency Mix',
            cancelReasons: TRANSLATIONS.analyticsCancelReasons || 'Cancellation Reasons',
            backlog: TRANSLATIONS.analyticsBacklog || 'Backlog Orders',
            topPerformersCompleted: TRANSLATIONS.analyticsTopByCompleted || 'Top by Completed Jobs',
            topPerformersRevenue: TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue',
            topDispatchersOrders: TRANSLATIONS.analyticsTopByOrders || 'Top by Orders',
            topDispatchersRevenue: TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue',
        };

        const detailItemsMap = {
            topAreas: analyticsLists.topAreas,
            topServices: analyticsLists.topServices,
            urgencyMix: analyticsLists.urgencyMix,
            cancelReasons: analyticsLists.cancelReasons,
            backlog: analyticsLists.backlogOrders,
            topPerformersCompleted: analyticsPeople.topByCompleted,
            topPerformersRevenue: analyticsPeople.topByRevenue,
            topDispatchersOrders: analyticsDispatchers.topByOrders,
            topDispatchersRevenue: analyticsDispatchers.topByRevenue,
        };

        const normalizeDateValue = (value) => {
            if (!value) return null;
            if (value instanceof Date) return value;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const updateCustomRange = (field, value) => {
            const normalized = normalizeDateValue(value);
            if (!normalized) return;
            setAnalyticsCustomRange(prev => {
                const next = { ...prev, [field]: normalized };
                if (next.start && next.end && next.start > next.end) {
                    if (field === 'start') next.end = normalized;
                    else next.start = normalized;
                }
                return next;
            });
        };

        const handleCustomDateChange = (field, event, selectedDate) => {
            if (Platform.OS !== 'ios') {
                setShowAnalyticsStartPicker(false);
                setShowAnalyticsEndPicker(false);
            }
            updateCustomRange(field, selectedDate);
        };

        const handleCustomDateText = (field, text) => {
            updateCustomRange(field, text);
        };

        const formatCustomDate = (date) => (
            date ? normalizeDateValue(date)?.toLocaleDateString(analyticsLocale) : (TRANSLATIONS.selectDate || 'Select date')
        );

        const formatCustomDateInput = (date) => {
            const normalized = normalizeDateValue(date);
            if (!normalized) return '';
            return normalized.toISOString().slice(0, 10);
        };

        const openWebDatePicker = (field, event) => {
            if (!isWeb || typeof document === 'undefined') return;
            const input = document.createElement('input');
            input.type = 'date';
            input.style.position = 'fixed';
            input.style.opacity = '0';
            input.style.pointerEvents = 'none';
            input.style.width = '1px';
            input.style.height = '1px';
            input.style.zIndex = '2147483647';
            const native = event?.nativeEvent || {};
            const x = native.clientX ?? native.pageX ?? 0;
            const y = native.clientY ?? native.pageY ?? 0;
            const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0;
            const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
            const left = Math.max(8, Math.min(x, Math.max(8, viewportW - 40)));
            const top = Math.max(8, Math.min(y, Math.max(8, viewportH - 40)));
            input.style.left = `${left}px`;
            input.style.top = `${top}px`;
            const currentValue = formatCustomDateInput(analyticsCustomRange[field]);
            if (currentValue) input.value = currentValue;
            if (field === 'end' && analyticsCustomRange.start) {
                const minValue = formatCustomDateInput(analyticsCustomRange.start);
                if (minValue) input.min = minValue;
            }
            const maxValue = formatCustomDateInput(new Date());
            if (maxValue) input.max = maxValue;
            const cleanup = () => {
                if (input.parentNode) input.parentNode.removeChild(input);
            };
            input.onchange = (event) => {
                const value = event?.target?.value;
                if (value) updateCustomRange(field, value);
                cleanup();
            };
            input.onblur = cleanup;
            document.body.appendChild(input);
            if (input.showPicker) {
                input.showPicker();
            } else {
                input.click();
            }
        };

        const getTrendEventPos = (event) => getPointerPos(event);

        const renderTrendDots = (series, maxValue, color, title, windowStart, windowEnd, avgValue, valueLabel, valueFormatter) => (
            <View style={styles.analyticsTrendArea}>
                <View style={styles.analyticsTrendGrid}>
                    <View style={styles.analyticsTrendGridLine} />
                    <View style={styles.analyticsTrendGridLine} />
                </View>
                <View style={styles.analyticsTrendYAxis}>
                    <Text style={[styles.analyticsTrendAxisText, !isDark && styles.analyticsTrendAxisTextLight]}>{formatNumber(maxValue)}</Text>
                    <Text style={[styles.analyticsTrendAxisText, !isDark && styles.analyticsTrendAxisTextLight]}>0</Text>
                </View>
                <View style={styles.analyticsTrendDots}>
                    {series.map((value, index) => {
                        const pct = maxValue === 0 ? 0 : value / maxValue;
                        const dotSize = 6 + Math.round(pct * 6);
                        const offset = Math.round(pct * (72 - dotSize));
                        const dotDate = new Date(windowStart.getTime() + (index * DAY_MS));
                        const showAt = (event, resetTimer = true) => {
                            const pos = getTrendEventPos(event);
                            showAnalyticsTrendTooltip({
                                title,
                                date: dotDate,
                                value: valueFormatter ? valueFormatter(value) : formatNumber(value),
                                valueLabel,
                                x: pos.x,
                                y: pos.y,
                            }, resetTimer);
                        };
                        return (
                            <View key={`${title}-${index}`} style={styles.analyticsTrendSlot}>
                                <TouchableOpacity
                                    onPress={(event) => showAt(event, true)}
                                    onMouseEnter={Platform.OS === 'web' ? (event) => showAt(event, true) : undefined}
                                    onMouseMove={Platform.OS === 'web'
                                        ? (event) => {
                                            if (!analyticsTrendTooltip) {
                                                showAt(event, true);
                                                return;
                                            }
                                            const pos = getTrendEventPos(event);
                                            updateAnalyticsTrendTooltipPos(pos.x, pos.y);
                                        }
                                        : undefined}
                                    onMouseLeave={Platform.OS === 'web' ? hideAnalyticsTrendTooltip : undefined}
                                    style={[
                                        styles.analyticsTrendDot,
                                        { width: dotSize, height: dotSize, backgroundColor: color, marginBottom: Math.max(0, offset) }
                                    ]}
                                />
                            </View>
                        );
                    })}
                </View>
                <View style={[styles.analyticsTrendAvgLine, { top: 6 + (72 - (maxValue ? (avgValue / maxValue) * 72 : 0)) }]} />
                <View style={styles.analyticsTrendAxis}>
                    <Text style={[styles.analyticsTrendAxisText, !isDark && styles.analyticsTrendAxisTextLight]}>{formatShortDate(windowStart, analyticsLocale)}</Text>
                    <Text style={[styles.analyticsTrendAxisText, !isDark && styles.analyticsTrendAxisTextLight]}>
                        {formatShortDate(new Date((windowStart.getTime() + windowEnd.getTime()) / 2), analyticsLocale)}
                    </Text>
                    <Text style={[styles.analyticsTrendAxisText, !isDark && styles.analyticsTrendAxisTextLight]}>{formatShortDate(windowEnd, analyticsLocale)}</Text>
                </View>
            </View>
        );

        return (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderHeader(TRANSLATIONS.analyticsTitle || 'Analytics')}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analyticsSectionTabs}>
                    {[
                    { key: 'operations', label: TRANSLATIONS.analyticsOperations || 'Operations' },
                        { key: 'financial', label: TRANSLATIONS.analyticsFinancial || 'Financial' },
                        { key: 'dispatchers', label: TRANSLATIONS.analyticsDispatchers || 'Dispatchers' },
                        { key: 'masters', label: TRANSLATIONS.analyticsMasters || 'Masters' },
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

                <View style={[styles.analyticsFilterCard, !isDark && styles.cardLight]}>
                    <View style={styles.analyticsFilterTopRow}>
                        <Text style={[styles.analyticsSectionLabel, !isDark && styles.textSecondary]}>
                            {TRANSLATIONS.analyticsTimeRange || 'Time Range'}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.analyticsRangeScroll} contentContainerStyle={styles.analyticsRangeRow}>
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
                                options: urgencyOptions,
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

                        {showPeopleFilter && (
                            <TouchableOpacity
                                style={[
                                    styles.analyticsFilterPill,
                                    styles.analyticsDispatcherPill,
                                    (analyticsSection === 'dispatchers' ? analyticsDispatcherId !== 'all' : analyticsMasterId !== 'all') && styles.analyticsFilterPillActive,
                                    !isDark && styles.analyticsFilterPillLight,
                                ]}
                                onPress={() => setPickerModal({
                                    visible: true,
                                    title: analyticsSection === 'dispatchers'
                                        ? (TRANSLATIONS.analyticsDispatcher || 'Dispatcher')
                                        : (TRANSLATIONS.analyticsMaster || 'Master'),
                                    options: analyticsSection === 'dispatchers' ? analyticsDispatcherOptions : analyticsMasterOptions,
                                    value: analyticsSection === 'dispatchers' ? analyticsDispatcherId : analyticsMasterId,
                                    onChange: analyticsSection === 'dispatchers' ? setAnalyticsDispatcherId : setAnalyticsMasterId,
                                })}
                            >
                                <View style={styles.analyticsFilterPillRow}>
                                    <Ionicons name="person-outline" size={14} color={isDark ? '#cbd5e1' : '#0f172a'} />
                                    <Text style={[styles.analyticsFilterPillText, !isDark && styles.textDark]} numberOfLines={1}>
                                        {analyticsSection === 'dispatchers' ? currentDispatcherLabel : currentMasterLabel}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-down" size={14} color={isDark ? '#64748b' : '#475569'} />
                            </TouchableOpacity>
                        )}

                        {showClearFilters && (
                            <TouchableOpacity style={styles.analyticsClearBtn} onPress={() => setAnalyticsFilters({ urgency: 'all', service: 'all', area: 'all' })}>
                                <Text style={styles.analyticsClearBtnText}>{TRANSLATIONS.clear || 'Clear'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {analyticsRange === 'custom' && (
                        <View style={styles.analyticsCustomRow}>
                            {isWeb ? (
                                <>
                                    <TouchableOpacity
                                        style={[styles.analyticsCustomButton, !isDark && styles.analyticsCustomButtonLight]}
                                        onPress={(event) => openWebDatePicker('start', event)}
                                    >
                                        <Text style={styles.analyticsCustomLabel}>{TRANSLATIONS.startDate || 'Start'}</Text>
                                        <Text style={[styles.analyticsCustomValue, !isDark && styles.textDark]}>
                                            {formatCustomDate(analyticsCustomRange.start)}
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={[styles.analyticsCustomSeparator, !isDark && styles.textDark]}>></Text>
                                    <TouchableOpacity
                                        style={[styles.analyticsCustomButton, !isDark && styles.analyticsCustomButtonLight]}
                                        onPress={(event) => openWebDatePicker('end', event)}
                                    >
                                        <Text style={styles.analyticsCustomLabel}>{TRANSLATIONS.endDate || 'End'}</Text>
                                        <Text style={[styles.analyticsCustomValue, !isDark && styles.textDark]}>
                                            {formatCustomDate(analyticsCustomRange.end)}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        style={[styles.analyticsCustomButton, !isDark && styles.analyticsCustomButtonLight]}
                                        onPress={() => setShowAnalyticsStartPicker(true)}
                                    >
                                        <Text style={styles.analyticsCustomLabel}>{TRANSLATIONS.startDate || 'Start'}</Text>
                                        <Text style={[styles.analyticsCustomValue, !isDark && styles.textDark]}>{formatCustomDate(analyticsCustomRange.start)}</Text>
                                    </TouchableOpacity>
                                    <Text style={[styles.analyticsCustomSeparator, !isDark && styles.textDark]}>></Text>
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
                                </>
                            )}
                        </View>
                    )}
                </View>

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
                    <View style={styles.analyticsRow}>
                        <View style={styles.analyticsRowItem}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsOrders || TRANSLATIONS.analyticsDailyOrders || 'Orders'}
                                subtitle={chartSubtitle}
                                series={analyticsChartSeries.ordersSeries}
                                labels={analyticsChartSeries.labels}
                                formatter={formatNumber}
                                isDark={isDark}
                                color="#3b82f6"
                            />
                        </View>
                        <View style={styles.analyticsRowItem}>
                            <LabeledBarChart
                                title={TRANSLATIONS.analyticsGMVFull || 'Gross Merchandise Value (GMV)'}
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
                    <View style={styles.analyticsRow}>
                        <View style={styles.analyticsRowItem}>
                            <View style={[styles.analyticsVisualCard, styles.analyticsStackedChartBlock, !isDark && styles.cardLight]}>
                                <View style={styles.analyticsStackedCharts}>
                                    <LabeledBarChart
                                        title={TRANSLATIONS.analyticsGMVFull || 'Gross Merchandise Value (GMV)'}
                                        subtitle={chartSubtitle}
                                        series={analyticsChartSeries.revenueSeries}
                                        labels={analyticsChartSeries.labels}
                                        formatter={formatMoney}
                                        isDark={isDark}
                                        color="#22c55e"
                                        barHeight={90}
                                        cardless
                                    />
                                    <View style={styles.analyticsStackedChartDivider} />
                                    <LabeledBarChart
                                        title={TRANSLATIONS.analyticsCommissionConfirmed || TRANSLATIONS.analyticsCommission || 'Commission (confirmed)'}
                                        subtitle={chartSubtitle}
                                        series={analyticsChartSeries.commissionSeries}
                                        labels={analyticsChartSeries.labels}
                                        formatter={formatMoney}
                                        isDark={isDark}
                                        color="#f59e0b"
                                        barHeight={90}
                                        cardless
                                    />
                                </View>
                            </View>
                        </View>
                        <View style={styles.analyticsRowItem}>
                            <View style={styles.analyticsFinancialMetricsBlock}>
                                <View style={styles.analyticsFinancialMetricsGrid}>
                                    <View style={styles.analyticsFinancialMetricItem}>
                                        <AnalyticsMetricCard
                                            label={TRANSLATIONS.analyticsGMVFull || 'Gross Merchandise Value (GMV)'}
                                            value={formatMoney(analyticsStats.gmv)}
                                            subLabel={`${TRANSLATIONS.analyticsAvgOrderValue || 'Average Order Value'} ${formatMoney(analyticsStats.avgTicket)}`}
                                            infoText={TRANSLATIONS.analyticsGMVTip || 'Sum of completed order values in the selected range (final/initial price). Tracks gross volume; subtitle shows AOV.'}
                                            infoHandlers={analyticsInfoHandlers}
                                            isDark={isDark}
                                        />
                                    </View>
                                    <View style={styles.analyticsFinancialMetricItem}>
                                        <AnalyticsMetricCard
                                            label={TRANSLATIONS.analyticsCommissionConfirmed || TRANSLATIONS.analyticsCommission || 'Commission (confirmed)'}
                                            value={formatMoney(analyticsStats.commissionCollected)}
                                            subLabel={`${TRANSLATIONS.analyticsAvgCommissionConfirmed || TRANSLATIONS.analyticsAvgCommission || 'Avg commission per confirmed order'} ${formatMoney(analyticsStats.avgCommissionPerOrder)}`}
                                            infoText={TRANSLATIONS.analyticsCommissionConfirmedTip || 'Commission collected from confirmed orders only (price ? rate). Subtitle shows average per confirmed order.'}
                                            infoHandlers={analyticsInfoHandlers}
                                            isDark={isDark}
                                        />
                                    </View>
                                <View style={styles.analyticsFinancialMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsPotentialEarningsLost || 'Potential Earnings Lost'}
                                        value={formatMoney(analyticsStats.lostEarningsTotal)}
                                        subLabel={`${TRANSLATIONS.analyticsAvgLost || 'Avg lost'} ${formatMoney(analyticsStats.lostEarningsAvg)}`}
                                        infoText={TRANSLATIONS.analyticsPotentialEarningsLostTip || 'Estimated net earnings lost from canceled jobs. Fixed-price uses order price; master quit uses average order price.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                    <View style={styles.analyticsFinancialMetricItem}>
                                        <AnalyticsMetricCard
                                            label={TRANSLATIONS.analyticsTopUpTotal || 'Topped Up Balance'}
                                            value={formatMoney(analyticsStats.topUpTotal)}
                                            subLabel={`${TRANSLATIONS.analyticsTopUpAvg || 'Average Top Up'} ${formatMoney(analyticsStats.topUpAvg)}`}
                                            infoText={TRANSLATIONS.analyticsTopUpTotalTip || 'Total balance top-ups made by admins to masters in this period. Subtitle shows average top-up.'}
                                            infoHandlers={analyticsInfoHandlers}
                                            isDark={isDark}
                                        />
                                    </View>
                                    <View style={styles.analyticsFinancialMetricItem}>
                                        <AnalyticsMetricCard
                                            label={TRANSLATIONS.analyticsCommissionOwed || 'Commission Owed'}
                                            value={formatMoney(analyticsStats.commissionOwed)}
                                            subLabel={`${formatNumber(analyticsStats.commissionOwedCount)} ${TRANSLATIONS.analyticsPendingConfirmations || 'pending confirmations'}`}
                                            infoText={TRANSLATIONS.analyticsCommissionOwedTip || 'Estimated commission owed from completed but not yet confirmed orders (price ? rate).'}
                                            infoHandlers={analyticsInfoHandlers}
                                            isDark={isDark}
                                        />
                                    </View>
                                <View style={styles.analyticsFinancialMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsTotalBalances || 'Total Balances'}
                                        value={formatMoney(analyticsStats.totalBalances)}
                                        subLabel={`${TRANSLATIONS.analyticsAvgBalance || 'Average Balance'} ${formatMoney(analyticsStats.avgBalance)}`}
                                        infoText={TRANSLATIONS.analyticsTotalBalancesTip || 'Sum of current master balances. Subtitle shows average balance; helps track overall liability.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {analyticsSection === 'dispatchers' && (
                    <>
                        <View style={styles.analyticsListGrid}>
                            <View style={styles.analyticsListColWide}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue'}
                                    items={analyticsDispatchers.topByRevenue}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topDispatchersRevenue' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                    infoText={TRANSLATIONS.analyticsTopDispatchersRevenueTip || 'Ranks dispatchers/admins by revenue from completed orders. Bar length shows relative revenue share.'}
                                    infoHandlers={analyticsInfoHandlers}
                                />
                            </View>
                            <View style={styles.analyticsListColWide}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByOrders || 'Top by Orders'}
                                    items={analyticsDispatchers.topByOrders}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topDispatchersOrders' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                    infoText={TRANSLATIONS.analyticsTopDispatchersOrdersTip || 'Ranks dispatchers/admins by total handled orders. Bar length shows relative order volume.'}
                                    infoHandlers={analyticsInfoHandlers}
                                />
                            </View>
                        </View>

                        <View style={[styles.analyticsVisualCard, styles.analyticsDispatcherCard, !isDark && styles.cardLight]}>
                            <View style={styles.analyticsDispatcherHeader}>
                                <View style={styles.analyticsTitleWithTip}>
                                    <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.analyticsDispatcherPerformance || 'Dispatcher Performance'}
                                    </Text>
                                    <InfoTip
                                        text={TRANSLATIONS.analyticsDispatcherPerformanceTip || 'Summary for the selected dispatcher/admin. Status mix shows open/active/completed/canceled counts and share. Metrics: created=orders created by them; handled=orders currently assigned; transferred=orders moved between dispatchers; total amount=completed order value; commission=commission on completed orders.'}
                                        isDark={isDark}
                                        handlers={analyticsInfoHandlers}
                                    />
                                </View>
                            </View>

                            <View style={styles.analyticsStatusHeader}>
                                <Text style={[styles.analyticsStatusTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.analyticsStatusMix || 'Status Mix'}
                                </Text>
                                <InfoTip
                                    text={TRANSLATIONS.analyticsStatusMixTip || "Shows how this dispatcher's orders split by status. Counts are absolute; percentages show share of total."}
                                    isDark={isDark}
                                    handlers={analyticsInfoHandlers}
                                />
                            </View>
                            <StatusStrip
                                segments={dispatcherStatusSegments}
                                isDark={isDark}
                                onSegmentHover={showStatusMixTooltip}
                                onSegmentMove={updateStatusMixTooltipPos}
                                onSegmentLeave={hideStatusMixTooltip}
                            />

                            <View style={styles.analyticsMetricGrid}>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherTotalOrders || 'Total Orders'}
                                        value={formatNumber(analyticsDispatcherStats.totalOrders)}
                                        infoText={TRANSLATIONS.analyticsDispatcherTotalOrdersTip || 'All orders linked to this dispatcher in the selected range (created or handled).'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherCreated || 'Created Orders'}
                                        value={formatNumber(analyticsDispatcherStats.createdOrders)}
                                        infoText={TRANSLATIONS.analyticsDispatcherCreatedTip || 'Orders originally created by this dispatcher/admin.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherHandled || 'Handled Orders'}
                                        value={formatNumber(analyticsDispatcherStats.handledOrders)}
                                        infoText={TRANSLATIONS.analyticsDispatcherHandledTip || 'Orders currently assigned to this dispatcher/admin.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherTransferred || 'Transferred Orders'}
                                        value={formatNumber(analyticsDispatcherStats.transferredOrders)}
                                        infoText={TRANSLATIONS.analyticsDispatcherTransferredTip || 'Orders moved between dispatchers where this dispatcher was involved.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherTotalAmount || 'Total Order Amount'}
                                        value={formatMoney(analyticsDispatcherStats.totalAmount)}
                                        infoText={TRANSLATIONS.analyticsDispatcherTotalAmountTip || 'Sum of completed/confirmed order amounts handled by this dispatcher.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsDispatcherCommission || 'Commission Collected'}
                                        value={formatMoney(analyticsDispatcherStats.commissionCollected)}
                                        infoText={TRANSLATIONS.analyticsDispatcherCommissionTip || 'Commission from completed/confirmed orders handled by this dispatcher.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                            </View>

                            <View style={styles.analyticsTrendSection}>
                                <View style={styles.analyticsTrendHeader}>
                                    <Text style={[styles.analyticsTrendTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.analyticsTrends || 'Trends'}
                                    </Text>
                                </View>
                                <View style={styles.analyticsTrendCards}>
                                    <View style={[styles.analyticsTrendCard, !isDark && styles.cardLight]}>
                                        <View style={styles.analyticsTrendCardHeader}>
                                            <Text style={styles.analyticsTrendCardTitle}>
                                                {TRANSLATIONS.dispatcherStatsTrendCreated || 'Created trend'}
                                            </Text>
                                            <Text style={styles.analyticsTrendCardMeta}>
                                                {(TRANSLATIONS.dispatcherStatsAvgPerDay || 'Avg/day')}: {dispatcherCreatedMeta.avg.toFixed(1)} - {(TRANSLATIONS.analyticsMax || 'Max')}: {formatNumber(dispatcherCreatedMeta.max)}
                                            </Text>
                                        </View>
                                        {dispatcherCreatedMeta.max === 0
                                            ? <Text style={styles.analyticsTrendEmptyText}>{TRANSLATIONS.analyticsEmpty || 'No activity in this period'}</Text>
                                            : renderTrendDots(
                                                dispatcherCreatedSeries,
                                                dispatcherCreatedMeta.max,
                                                '#3b82f6',
                                                TRANSLATIONS.dispatcherStatsTrendCreated || 'Created trend',
                                                dispatcherTrendWindow.start,
                                                dispatcherTrendWindow.end,
                                                dispatcherCreatedMeta.avg,
                                                TRANSLATIONS.dispatcherStatsTooltipValue || 'Orders',
                                                (val) => formatNumber(val)
                                            )}
                                    </View>
                                    <View style={[styles.analyticsTrendCard, !isDark && styles.cardLight]}>
                                        <View style={styles.analyticsTrendCardHeader}>
                                            <Text style={styles.analyticsTrendCardTitle}>
                                                {TRANSLATIONS.dispatcherStatsTrendHandled || 'Handled trend'}
                                            </Text>
                                            <Text style={styles.analyticsTrendCardMeta}>
                                                {(TRANSLATIONS.dispatcherStatsAvgPerDay || 'Avg/day')}: {dispatcherHandledMeta.avg.toFixed(1)} - {(TRANSLATIONS.analyticsMax || 'Max')}: {formatNumber(dispatcherHandledMeta.max)}
                                            </Text>
                                        </View>
                                        {dispatcherHandledMeta.max === 0
                                            ? <Text style={styles.analyticsTrendEmptyText}>{TRANSLATIONS.analyticsEmpty || 'No activity in this period'}</Text>
                                            : renderTrendDots(
                                                dispatcherHandledSeries,
                                                dispatcherHandledMeta.max,
                                                '#22c55e',
                                                TRANSLATIONS.dispatcherStatsTrendHandled || 'Handled trend',
                                                dispatcherTrendWindow.start,
                                                dispatcherTrendWindow.end,
                                                dispatcherHandledMeta.avg,
                                                TRANSLATIONS.dispatcherStatsTooltipValue || 'Orders',
                                                (val) => formatNumber(val)
                                            )}
                                    </View>
                                </View>
                            </View>
                        </View>
                    </>
                )}

                {analyticsSection === 'masters' && (
                    <>
                        <View style={styles.analyticsListGrid}>
                            <View style={styles.analyticsListColWide}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByCompleted || 'Top by Completed Jobs'}
                                    items={analyticsPeople.topByCompleted}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topPerformersCompleted' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                            <View style={styles.analyticsListColWide}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopByRevenue || 'Top by Revenue'}
                                    items={analyticsPeople.topByRevenue}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topPerformersRevenue' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                        </View>

                        <View style={[styles.analyticsVisualCard, styles.analyticsMasterCard, !isDark && styles.cardLight]}>
                            <View style={styles.analyticsDispatcherHeader}>
                                <View style={styles.analyticsTitleWithTip}>
                                    <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.analyticsMasterPerformance || 'Master Performance'}
                                    </Text>
                                    <InfoTip
                                        text={TRANSLATIONS.analyticsMasterPerformanceTip || 'Summary for the selected master. Status mix shows open/active/completed/canceled counts and share. Metrics: total/active/completed/canceled orders plus revenue and average order value.'}
                                        isDark={isDark}
                                        handlers={analyticsInfoHandlers}
                                    />
                                </View>
                            </View>

                            <View style={styles.analyticsStatusHeader}>
                                <Text style={[styles.analyticsStatusTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.analyticsStatusMix || 'Status Mix'}
                                </Text>
                                <InfoTip
                                    text={TRANSLATIONS.analyticsMasterStatusMixTip || "Shows how this master's orders split by status. Counts are absolute; percentages show share of total."}
                                    isDark={isDark}
                                    handlers={analyticsInfoHandlers}
                                />
                            </View>
                            <StatusStrip
                                segments={masterStatusSegments}
                                isDark={isDark}
                                onSegmentHover={showStatusMixTooltip}
                                onSegmentMove={updateStatusMixTooltipPos}
                                onSegmentLeave={hideStatusMixTooltip}
                            />

                            <View style={styles.analyticsMetricGrid}>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterTotalOrders || 'Total Orders'}
                                        value={formatNumber(analyticsMasterStats.totalOrders)}
                                        infoText={TRANSLATIONS.analyticsMasterTotalOrdersTip || 'All orders assigned to this master in the selected range.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterActiveJobs || 'Active Jobs'}
                                        value={formatNumber(analyticsMasterStats.activeJobs)}
                                        infoText={TRANSLATIONS.analyticsMasterActiveJobsTip || 'Orders currently in claimed/started work status for this master.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterCompleted || 'Completed Jobs'}
                                        value={formatNumber(analyticsMasterStats.completedOrders)}
                                        infoText={TRANSLATIONS.analyticsMasterCompletedTip || 'Orders completed or confirmed by this master.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterCanceled || 'Canceled Jobs'}
                                        value={formatNumber(analyticsMasterStats.canceledOrders)}
                                        infoText={TRANSLATIONS.analyticsMasterCanceledTip || 'Orders canceled while assigned to this master.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterTotalAmount || 'Total Revenue'}
                                        value={formatMoney(analyticsMasterStats.totalAmount)}
                                        infoText={TRANSLATIONS.analyticsMasterTotalAmountTip || 'Sum of completed order amounts for this master.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={{ width: cardWidth }}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsMasterAvgOrderValue || 'Avg Order Value'}
                                        value={formatMoney(analyticsMasterStats.avgOrderValue)}
                                        infoText={TRANSLATIONS.analyticsMasterAvgOrderValueTip || 'Average value of completed orders for this master.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                            </View>

                            <View style={styles.analyticsTrendSection}>
                                <View style={styles.analyticsTrendHeader}>
                                    <Text style={[styles.analyticsTrendTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.analyticsTrends || 'Trends'}
                                    </Text>
                                </View>
                                <View style={styles.analyticsTrendCards}>
                                    <View style={[styles.analyticsTrendCard, !isDark && styles.cardLight]}>
                                        <View style={styles.analyticsTrendCardHeader}>
                                            <Text style={styles.analyticsTrendCardTitle}>
                                                {TRANSLATIONS.analyticsMasterTrendCompleted || 'Completed trend'}
                                            </Text>
                                            <Text style={styles.analyticsTrendCardMeta}>
                                                {(TRANSLATIONS.dispatcherStatsAvgPerDay || 'Avg/day')}: {masterCompletedMeta.avg.toFixed(1)} - {(TRANSLATIONS.analyticsMax || 'Max')}: {formatNumber(masterCompletedMeta.max)}
                                            </Text>
                                        </View>
                                        {masterCompletedMeta.max === 0
                                            ? <Text style={styles.analyticsTrendEmptyText}>{TRANSLATIONS.analyticsEmpty || 'No activity in this period'}</Text>
                                            : renderTrendDots(
                                                masterCompletedSeries,
                                                masterCompletedMeta.max,
                                                '#22c55e',
                                                TRANSLATIONS.analyticsMasterTrendCompleted || 'Completed trend',
                                                masterTrendWindow.start,
                                                masterTrendWindow.end,
                                                masterCompletedMeta.avg,
                                                TRANSLATIONS.dispatcherStatsTooltipValue || 'Orders',
                                                (val) => formatNumber(val)
                                            )}
                                    </View>
                                    <View style={[styles.analyticsTrendCard, !isDark && styles.cardLight]}>
                                        <View style={styles.analyticsTrendCardHeader}>
                                            <Text style={styles.analyticsTrendCardTitle}>
                                                {TRANSLATIONS.analyticsMasterTrendRevenue || 'Revenue trend'}
                                            </Text>
                                            <Text style={styles.analyticsTrendCardMeta}>
                                                {(TRANSLATIONS.dispatcherStatsAvgPerDay || 'Avg/day')}: {formatMoney(masterRevenueMeta.avg)} {TRANSLATIONS.currency || 'som'} - {(TRANSLATIONS.analyticsMax || 'Max')}: {formatMoney(masterRevenueMeta.max)} {TRANSLATIONS.currency || 'som'}
                                            </Text>
                                        </View>
                                        {masterRevenueMeta.max === 0
                                            ? <Text style={styles.analyticsTrendEmptyText}>{TRANSLATIONS.analyticsEmpty || 'No activity in this period'}</Text>
                                            : renderTrendDots(
                                                masterRevenueSeries,
                                                masterRevenueMeta.max,
                                                '#f59e0b',
                                                TRANSLATIONS.analyticsMasterTrendRevenue || 'Revenue trend',
                                                masterTrendWindow.start,
                                                masterTrendWindow.end,
                                                masterRevenueMeta.avg,
                                                TRANSLATIONS.analyticsRevenue || 'Revenue',
                                                (val) => `${formatMoney(val)} ${TRANSLATIONS.currency || 'som'}`
                                            )}
                                    </View>
                                </View>
                            </View>
                        </View>
                    </>
                )}

                {analyticsSection === 'overview' && (
                    <View style={styles.analyticsVisualGrid}>
                        <View style={{ width: listWidth }}>
                            <View style={[styles.analyticsVisualCard, !isDark && styles.cardLight]}>
                                <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.analyticsStatusMix || 'Status Mix'}
                                </Text>
                                <StatusStrip
                                    segments={overviewStatusSegments}
                                    isDark={isDark}
                                    onSegmentHover={showStatusMixTooltip}
                                    onSegmentMove={updateStatusMixTooltipPos}
                                    onSegmentLeave={hideStatusMixTooltip}
                                />
                            </View>
                        </View>
                    </View>
                )}

                {analyticsSection === 'operations' && (
                    <View style={styles.analyticsOperationsRow}>
                        <View style={styles.analyticsOperationsStatus}>
                            <View style={[styles.analyticsVisualCard, styles.analyticsOperationsStatusCard, !isDark && styles.cardLight]}>
                                <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.analyticsStatusMix || 'Status Mix'}
                                </Text>
                                <StatusPie
                                    size={190}
                                    segments={overviewStatusSegments}
                                    isDark={isDark}
                                    onSegmentHover={showStatusMixTooltip}
                                    onSegmentMove={updateStatusMixTooltipPos}
                                    onSegmentLeave={hideStatusMixTooltip}
                                />
                            </View>
                        </View>
                        <View style={styles.analyticsOperationsMetrics}>
                            <View style={styles.analyticsOperationsMetricsGrid}>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsInProgress || 'In Progress'}
                                        value={formatNumber(analyticsStats.inProgress)}
                                        subLabel={`${formatNumber(analyticsStats.startedCount)} ${TRANSLATIONS.analyticsStarted || 'started'}`}
                                        onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.analyticsInProgress || 'In Progress', o => ['claimed', 'started'].includes(normalizeStatus(o.status)))}
                                        infoText={TRANSLATIONS.analyticsInProgressTip || 'Orders currently claimed or started. Shows active workload; rising values mean more jobs in progress.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsUrgentOrders || 'Urgent Orders'}
                                        value={formatNumber(analyticsStats.urgentCount)}
                                        subLabel={`${formatNumber(analyticsStats.emergencyCount)} ${TRANSLATIONS.urgencyEmergency || 'Emergency'}`}
                                        onPress={() => setAnalyticsDetail({ type: 'urgencyMix' })}
                                        infoText={TRANSLATIONS.analyticsUrgentOrdersTip || 'Orders marked urgent/emergency. Highlights fast-response demand; compare emergency count in the subtitle.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsAvailablePool || 'Available Pool'}
                                        value={formatNumber(analyticsStats.availablePool)}
                                        subLabel={`${formatNumber(analyticsStats.claimedCount)} ${TRANSLATIONS.analyticsClaimed || 'claimed'}`}
                                        onPress={() => openAnalyticsOrdersModal(TRANSLATIONS.analyticsAvailablePool || 'Available Pool', o => ['placed', 'reopened'].includes(normalizeStatus(o.status)))}
                                        infoText={TRANSLATIONS.analyticsAvailablePoolTip || 'Open and unclaimed orders (placed/reopened). Indicates queue size waiting for assignment.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsOldestOpen || 'Oldest Open'}
                                        value={analyticsStats.oldestOpenAge ? `${analyticsStats.oldestOpenAge.toFixed(1)} ${TRANSLATIONS.analyticsHoursUnit || 'hours'}` : '-'}
                                        subLabel={`${TRANSLATIONS.analyticsAvgAge || 'Average Age'} ${analyticsStats.avgOpenAge ? `${analyticsStats.avgOpenAge.toFixed(1)} ${TRANSLATIONS.analyticsHoursUnit || 'hours'}` : '-'}`}
                                        onPress={() => setAnalyticsDetail({ type: 'backlog' })}
                                        infoText={TRANSLATIONS.analyticsOldestOpenTip || 'Age of the oldest open order. High values signal delays; subtitle shows average open age.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsServiceLevelRisk || 'Service Level Risk'}
                                        value={formatNumber(analyticsStats.openOlder48h)}
                                        subLabel={TRANSLATIONS.analyticsOver48h || 'open > 48h'}
                                        infoText={TRANSLATIONS.analyticsServiceLevelRiskTip || 'Count of open orders older than 48 hours. Use as an SLA risk indicator.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                                <View style={styles.analyticsOperationsMetricItem}>
                                    <AnalyticsMetricCard
                                        label={TRANSLATIONS.analyticsReopened || 'Reopened'}
                                        value={formatNumber(analyticsStats.reopenedCount)}
                                        subLabel={`${formatPercent(analyticsStats.reopenRate)} ${TRANSLATIONS.analyticsReopenRate || 'reopen rate'}`}
                                        infoText={TRANSLATIONS.analyticsReopenedTip || 'Orders reopened after cancel/expiry. Reopen rate = reopened / total orders in range.'}
                                        infoHandlers={analyticsInfoHandlers}
                                        isDark={isDark}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {analyticsSection === 'financial' && (
                    <View style={styles.analyticsRow}>
                        <View style={styles.analyticsRowItem}>
                            <View style={[styles.analyticsVisualCard, styles.analyticsPriceDistCard, !isDark && styles.cardLight]}>
                                <View style={styles.analyticsPriceDistHeader}>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.analyticsTitleWithTip}>
                                            <Text style={[styles.analyticsVisualTitle, !isDark && styles.textDark]}>
                                                {TRANSLATIONS.analyticsPriceDistribution || 'Order Price Distribution'}
                                            </Text>
                                            <InfoTip
                                                text={
                                                    TRANSLATIONS.analyticsPriceDistributionTip
                                                    || 'Distribution of order prices by time bucket. Box = P25-P75, solid line = median, dashed line = mean trend. Whiskers show P5-P95. Hover a bucket to see mean and spread.'
                                                }
                                                isDark={isDark}
                                                handlers={analyticsInfoHandlers}
                                            />
                                        </View>
                                        <Text style={[styles.analyticsPriceDistMeta, !isDark && styles.textSecondary]}>
                                            {(TRANSLATIONS.analyticsPriceDistributionMetric || 'Metric')}: {TRANSLATIONS.analyticsPriceDistributionMetricPrice || 'Order price'}
                                        </Text>
                                    </View>
                                    <View />
                                </View>

                                <View style={styles.analyticsPriceDistControlRow}>
                                    <View style={styles.analyticsPriceDistControlGroup}>
                                        <Text style={[styles.analyticsPriceDistControlLabel, !isDark && styles.textSecondary]}>
                                            {TRANSLATIONS.analyticsPriceDistributionRange || 'Range'}
                                        </Text>
                                        <View style={styles.analyticsPriceDistChipRow}>
                                            {priceDistRangeOptions.map(opt => {
                                                const active = priceDistRange === opt.key;
                                                return (
                                                    <TouchableOpacity
                                                        key={`price-range-${opt.key}`}
                                                        style={[
                                                            styles.analyticsPriceDistChip,
                                                            !isDark && styles.analyticsPriceDistChipLight,
                                                            active && styles.analyticsPriceDistChipActive,
                                                        ]}
                                                        onPress={() => setPriceDistRange(opt.key)}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.analyticsPriceDistChipText,
                                                                !isDark && styles.analyticsPriceDistChipTextLight,
                                                                active && styles.analyticsPriceDistChipTextActive,
                                                            ]}
                                                        >
                                                            {opt.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                    <View style={styles.analyticsPriceDistControlGroup}>
                                        <Text style={[styles.analyticsPriceDistControlLabel, !isDark && styles.textSecondary]}>
                                            {TRANSLATIONS.analyticsPriceDistributionGrouping || 'Grouping'}
                                        </Text>
                                        <View style={styles.analyticsPriceDistChipRow}>
                                            {priceDistGroupingOptions.map(opt => {
                                                const active = priceDistGrouping === opt.key;
                                                const disabled = !allowedGroupings.includes(opt.key);
                                                return (
                                                    <TouchableOpacity
                                                        key={`price-group-${opt.key}`}
                                                        style={[
                                                            styles.analyticsPriceDistChip,
                                                            !isDark && styles.analyticsPriceDistChipLight,
                                                            active && styles.analyticsPriceDistChipActive,
                                                            disabled && styles.analyticsPriceDistChipDisabled,
                                                        ]}
                                                        onPress={() => {
                                                            if (!disabled) {
                                                                setPriceDistGrouping(opt.key);
                                                            }
                                                        }}
                                                        disabled={disabled}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.analyticsPriceDistChipText,
                                                                !isDark && styles.analyticsPriceDistChipTextLight,
                                                                active && styles.analyticsPriceDistChipTextActive,
                                                                disabled && styles.analyticsPriceDistChipTextDisabled,
                                                            ]}
                                                        >
                                                            {opt.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                    <View style={styles.analyticsPriceDistControlGroup}>
                                        <Text style={[styles.analyticsPriceDistControlLabel, !isDark && styles.textSecondary]}>
                                            {TRANSLATIONS.analyticsPriceDistributionScope || 'Scope'}
                                        </Text>
                                        <View style={styles.analyticsPriceDistChipRow}>
                                            {priceDistScopeOptions.map(opt => {
                                                const active = priceDistScope === opt.key;
                                                return (
                                                    <TouchableOpacity
                                                        key={`price-scope-${opt.key}`}
                                                        style={[
                                                            styles.analyticsPriceDistChip,
                                                            !isDark && styles.analyticsPriceDistChipLight,
                                                            active && styles.analyticsPriceDistChipActive,
                                                        ]}
                                                        onPress={() => setPriceDistScope(opt.key)}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.analyticsPriceDistChipText,
                                                                !isDark && styles.analyticsPriceDistChipTextLight,
                                                                active && styles.analyticsPriceDistChipTextActive,
                                                            ]}
                                                        >
                                                            {opt.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </View>
                                {priceDistGroupingNotice ? (
                                    <Text style={[styles.analyticsPriceDistNotice, !isDark && styles.textSecondary]}>
                                        {priceDistGroupingNotice}
                                    </Text>
                                ) : null}

                                <View style={styles.analyticsPriceDistBody}>
                                    <View
                                        style={styles.analyticsPriceDistChartWrap}
                                        onLayout={(event) => {
                                            const nextWidth = Math.round(event?.nativeEvent?.layout?.width || 0);
                                            setPriceDistChartWidth(prev => (prev === nextWidth ? prev : nextWidth));
                                        }}
                                    >
                                        <BoxPlotChart
                                            buckets={priceDistData?.buckets || []}
                                            width={priceDistChartWidth}
                                            height={220}
                                            isDark={isDark}
                                            p90={priceDistSummary?.p90 || 0}
                                            yLabel={priceDistYAxisLabel}
                                            yTicks={priceDistTicks}
                                            yHighlights={{
                                                max: priceDistSummary?.max,
                                                mean: priceDistSummary?.mean,
                                                p75: priceDistSummary?.p75,
                                                p50: priceDistSummary?.p50,
                                                p25: priceDistSummary?.p25,
                                                min: priceDistSummary?.min,
                                            }}
                                            onBucketPress={handlePriceDistPress}
                                            onBucketHover={handlePriceDistHover}
                                            onBucketMove={handlePriceDistMove}
                                            onBucketLeave={handlePriceDistLeave}
                                        />
                                        {priceDistSummary?.n ? (
                                            <View>
                                                <Text style={[styles.analyticsPriceDistNote, !isDark && styles.textSecondary]}>
                                                    {TRANSLATIONS.analyticsPriceDistributionWhiskers || 'Whiskers show P5-P95. Solid line = median, dashed = mean.'}
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={[styles.analyticsTrendEmptyText, !isDark && styles.textSecondary]}>
                                                {TRANSLATIONS.analyticsEmpty || 'No activity in this period'}
                                            </Text>
                                        )}
                                    </View>

                                    <View style={[styles.analyticsPriceDistSummary, !isDark && styles.analyticsPriceDistSummaryLight]}>
                                        <Text style={[styles.analyticsPriceDistSummaryTitle, !isDark && styles.textDark]}>
                                            {TRANSLATIONS.analyticsPriceDistributionSummary || 'Summary'}
                                        </Text>
                                        <View style={styles.analyticsPriceDistStatsGrid}>
                                            {priceDistStatItems.map(item => (
                                                <TouchableOpacity
                                                    key={item.key}
                                                    style={[
                                                        styles.analyticsPriceDistStat,
                                                        item.primary && styles.analyticsPriceDistStatPrimary,
                                                        !isDark && styles.analyticsPriceDistStatLight,
                                                        item.primary && !isDark && styles.analyticsPriceDistStatPrimaryLight,
                                                        Platform.OS === 'web' ? styles.analyticsPriceDistStatHoverable : null,
                                                    ]}
                                                    activeOpacity={1}
                                                    onPress={Platform.OS !== 'web' ? () => showPriceDistMetricTooltip(item) : undefined}
                                                    onMouseEnter={Platform.OS === 'web' ? (event) => showPriceDistMetricTooltip(item, event) : undefined}
                                                    onMouseMove={Platform.OS === 'web' ? updatePriceDistMetricTooltipPos : undefined}
                                                    onMouseLeave={Platform.OS === 'web' ? hidePriceDistMetricTooltip : undefined}
                                                >
                                                    <Text style={[styles.analyticsPriceDistStatLabel, !isDark && styles.textSecondary]}>
                                                        {item.label}
                                                    </Text>
                                                    <Text style={[
                                                        styles.analyticsPriceDistStatValue,
                                                        item.primary && styles.analyticsPriceDistStatValuePrimary,
                                                        item.primary && !isDark && styles.analyticsPriceDistStatValuePrimaryLight,
                                                        !item.primary && !isDark && styles.textDark,
                                                    ]}>
                                                        {item.value}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {analyticsSection !== 'operations' && analyticsSection !== 'financial' && (
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



                    </View>
                )}

                {analyticsSection === 'operations' && (
                    <>
                        <View style={styles.analyticsRow}>
                            <View style={styles.analyticsRowItem}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopAreas || 'Top Areas'}
                                    items={analyticsLists.topAreas}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No area data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topAreas' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                            <View style={styles.analyticsRowItem}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsTopServices || 'Top Services'}
                                    items={analyticsLists.topServices}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No service data'}
                                    onPress={() => setAnalyticsDetail({ type: 'topServices' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                        </View>
                        <View style={styles.analyticsRow}>
                            <View style={styles.analyticsRowItem}>
                                <AnalyticsListCard
                                    title={TRANSLATIONS.analyticsUrgencyMix || 'Urgency Mix'}
                                    items={analyticsLists.urgencyMix}
                                    emptyLabel={TRANSLATIONS.emptyList || 'No urgency data'}
                                    onPress={() => setAnalyticsDetail({ type: 'urgencyMix' })}
                                    isDark={isDark}
                                    actionLabel={TRANSLATIONS.view || 'View'}
                                />
                            </View>
                            <View style={styles.analyticsRowItem}>
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
                    </>
                )}

                <View style={{ height: 0 }} />

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

                {analyticsTooltip && (
                    <View
                        style={[
                            styles.analyticsTooltip,
                            !isDark && styles.analyticsTooltipLight,
                            resolveFloatingTooltipStyle(analyticsTooltip?.x, analyticsTooltip?.y, 260, 130),
                            { pointerEvents: 'none' }
                        ]}
                    >
                        <Text style={[styles.analyticsTooltipText, !isDark && styles.textDark]}>
                            {analyticsTooltip.text}
                        </Text>
                    </View>
                )}

                {analyticsTrendTooltip && (
                    <View
                        style={[
                            styles.analyticsTrendTooltip,
                            !isDark && styles.analyticsTrendTooltipLight,
                            resolveFloatingTooltipStyle(analyticsTrendTooltip?.x, analyticsTrendTooltip?.y, 240, 130),
                            { pointerEvents: 'none' }
                        ]}
                    >
                        <Text style={[styles.analyticsTrendTooltipTitle, !isDark && styles.textDark]}>
                            {analyticsTrendTooltip.title}
                        </Text>
                        <Text style={[styles.analyticsTrendTooltipText, !isDark && styles.textSecondary]}>
                            {(TRANSLATIONS.dispatcherStatsTooltipDate || 'Date')}: {formatShortDate(analyticsTrendTooltip.date, analyticsLocale)}
                        </Text>
                        <Text style={[styles.analyticsTrendTooltipText, !isDark && styles.textSecondary]}>
                            {(analyticsTrendTooltip.valueLabel || TRANSLATIONS.dispatcherStatsTooltipValue || 'Value')}: {analyticsTrendTooltip.value}
                        </Text>
                    </View>
                )}

                {priceDistTooltip && (
                    <View
                        style={[
                            styles.analyticsPriceDistTooltip,
                            !isDark && styles.analyticsPriceDistTooltipLight,
                            resolveFloatingTooltipStyle(priceDistTooltip?.x, priceDistTooltip?.y, 260, 300),
                            { pointerEvents: 'none' }
                        ]}
                    >
                        <Text style={[styles.analyticsPriceDistTooltipTitle, !isDark && styles.textDark]}>
                            {priceDistTooltip.title}
                        </Text>
                        {[
                            { label: TRANSLATIONS.analyticsPriceDistributionN || 'N', value: formatNumber(priceDistTooltip.n) },
                            { label: TRANSLATIONS.analyticsPriceDistributionMin || 'Min', value: formatMoneyCurrency(priceDistTooltip.min) },
                            { label: TRANSLATIONS.analyticsPriceDistributionP25 || 'P25', value: formatMoneyCurrency(priceDistTooltip.p25) },
                            { label: TRANSLATIONS.analyticsPriceDistributionMedian || 'Median', value: formatMoneyCurrency(priceDistTooltip.p50) },
                            { label: TRANSLATIONS.analyticsPriceDistributionP75 || 'P75', value: formatMoneyCurrency(priceDistTooltip.p75) },
                            { label: TRANSLATIONS.analyticsPriceDistributionMax || 'Max', value: formatMoneyCurrency(priceDistTooltip.max) },
                            { label: TRANSLATIONS.analyticsPriceDistributionMean || 'Mean', value: formatMoneyCurrency(priceDistTooltip.mean) },
                            { label: TRANSLATIONS.analyticsPriceDistributionStd || 'STD', value: formatMoneyCurrency(priceDistTooltip.std) },
                            { label: TRANSLATIONS.analyticsPriceDistributionP90 || 'P90', value: formatMoneyCurrency(priceDistTooltip.p90) },
                        ].map(row => (
                            <View key={row.label} style={styles.analyticsPriceDistTooltipRow}>
                                <Text style={[styles.analyticsPriceDistTooltipLabel, !isDark && styles.textSecondary]}>
                                    {row.label}
                                </Text>
                                <Text style={[styles.analyticsPriceDistTooltipValue, !isDark && styles.textDark]}>
                                    {row.value}
                                </Text>
                            </View>
                        ))}
                        {priceDistTooltip.smallSample ? (
                            <Text style={[styles.analyticsPriceDistTooltipNote, !isDark && styles.textSecondary]}>
                                {TRANSLATIONS.analyticsPriceDistributionSmallSample || 'Low sample (N<5)'}
                            </Text>
                        ) : null}
                    </View>
                )}
                {statusMixTooltip && (
                    <View
                        style={[
                            styles.analyticsStatusMixTooltip,
                            !isDark && styles.analyticsStatusMixTooltipLight,
                            resolveFloatingTooltipStyle(statusMixTooltip?.x, statusMixTooltip?.y, 220, 110),
                            { pointerEvents: 'none' },
                        ]}
                    >
                        <View style={styles.analyticsStatusMixTooltipHead}>
                            <View style={[styles.analyticsStatusMixTooltipDot, { backgroundColor: statusMixTooltip.color || '#3b82f6' }]} />
                            <Text style={[styles.analyticsStatusMixTooltipTitle, !isDark && styles.textDark]}>
                                {statusMixTooltip.label}
                            </Text>
                        </View>
                        <Text style={[styles.analyticsStatusMixTooltipText, !isDark && styles.textSecondary]}>
                            {(TRANSLATIONS.analyticsCount || 'Count')}: {formatNumber(statusMixTooltip.value)}
                        </Text>
                        <Text style={[styles.analyticsStatusMixTooltipText, !isDark && styles.textSecondary]}>
                            {(TRANSLATIONS.analyticsShare || 'Share')}: {formatPercent(statusMixTooltip.percent)}
                        </Text>
                    </View>
                )}
                {priceDistMetricTooltip && (
                    <View
                        style={[
                            styles.analyticsPriceDistMetricTooltip,
                            !isDark && styles.analyticsPriceDistMetricTooltipLight,
                            resolveFloatingTooltipStyle(priceDistMetricTooltip?.x, priceDistMetricTooltip?.y, 300, 170),
                            { pointerEvents: 'none' },
                        ]}
                    >
                        <Text style={[styles.analyticsPriceDistMetricTooltipTitle, !isDark && styles.textDark]}>
                            {priceDistMetricTooltip.title}
                        </Text>
                        <Text style={[styles.analyticsPriceDistMetricTooltipValue, !isDark && styles.textDark]}>
                            {priceDistMetricTooltip.value}
                        </Text>
                        <Text style={[styles.analyticsPriceDistMetricTooltipText, !isDark && styles.textSecondary]}>
                            {priceDistMetricTooltip.infoText}
                        </Text>
                    </View>
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

    const openAnalyticsOrdersModal = (title, predicate, listOverride) => {
        const baseList = listOverride || analyticsOrders;
        const list = predicate ? baseList.filter(predicate) : baseList;
        setStatModalTitle(title);
        setStatFilteredOrders(list);
        setStatModalVisible(true);
}
