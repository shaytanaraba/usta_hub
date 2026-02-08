import React from 'react';
import { Dimensions, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Path, Circle, Rect, Line, Text as SvgText } from 'react-native-svg';

import styles from '../styles/dashboardStyles';

const SCREEN_WIDTH = Dimensions.get('window').width;
const sanitizeNumberInput = (value) => {
    if (value === null || value === undefined) return '';
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length <= 1 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`;
};

const formatNumber = (value) => (Number.isFinite(value) ? Number(value).toLocaleString() : '-');
const formatMoney = (value) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString()}` : '-');
const formatPercent = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : '-');
const formatShortDate = (date, locale = 'en-US') => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};
const DAY_MS = 24 * 60 * 60 * 1000;

const percentile = (sortedValues, p) => {
    if (!sortedValues.length) return 0;
    const n = sortedValues.length;
    const index = (p / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
};

const calcStats = (values) => {
    if (!values.length) {
        return {
            n: 0,
            min: 0,
            max: 0,
            mean: 0,
            std: 0,
            p5: 0,
            p25: 0,
            p50: 0,
            p75: 0,
            p90: 0,
            p95: 0,
            iqr: 0,
            cv: 0,
        };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const min = sorted[0];
    const max = sorted[n - 1];
    const mean = sorted.reduce((sum, val) => sum + val, 0) / n;
    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const p5 = percentile(sorted, 5);
    const p25 = percentile(sorted, 25);
    const p50 = percentile(sorted, 50);
    const p75 = percentile(sorted, 75);
    const p90 = percentile(sorted, 90);
    const p95 = percentile(sorted, 95);
    const iqr = p75 - p25;
    const cv = mean ? std / mean : 0;
    return { n, min, max, mean, std, p5, p25, p50, p75, p90, p95, iqr, cv };
};
const hoursSince = (dateValue) => {
    if (!dateValue) return null;
    const ts = new Date(dateValue).getTime();
    if (Number.isNaN(ts)) return null;
    return (Date.now() - ts) / 3600000;
};
const normalizeStatus = (status) => String(status || '').toLowerCase();
const COMPLETED_STATUSES = new Set(['completed', 'confirmed']);
const CANCELED_STATUSES = new Set(['canceled', 'cancelled', 'canceled_by_client', 'canceled_by_master', 'canceled_by_admin']);
const isReopenableStatus = (status) => {
    const normalized = normalizeStatus(status);
    return normalized === 'expired' || normalized.startsWith('canceled') || normalized.startsWith('cancelled');
};
const getAnalyticsColumns = () => {
    if (SCREEN_WIDTH >= 1024) return 3;
    if (SCREEN_WIDTH >= 768) return 2;
    return 1;
};

const AnalyticsMetricCard = ({ label, value, subLabel, onPress, isDark, sparkData, infoText, infoHandlers }) => {
    const safeSubLabel = subLabel ?? '\u00A0';
    return (
        <TouchableOpacity
            style={[styles.analyticsMetricCard, !isDark && styles.cardLight]}
            onPress={onPress}
            activeOpacity={onPress ? 0.8 : 1}
        >
            <View style={styles.analyticsMetricTopRow}>
                <View style={{ flex: 1 }}>
                    <View style={styles.analyticsMetricLabelRow}>
                        <Text style={[styles.analyticsMetricLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>{label}</Text>
                        {infoText ? <InfoTip text={infoText} isDark={isDark} handlers={infoHandlers} /> : null}
                    </View>
                    <Text style={[styles.analyticsMetricValue, !isDark && styles.textDark]}>{value}</Text>
                </View>
                {sparkData?.length ? <MiniBars data={sparkData} isDark={isDark} height={22} barWidth={5} /> : null}
            </View>
            <Text style={[styles.analyticsMetricSub, { color: isDark ? '#94a3b8' : '#64748b' }]}>{safeSubLabel}</Text>
        </TouchableOpacity>
    );
};

const AnalyticsListCard = ({ title, items, emptyLabel, onPress, isDark, actionLabel = 'View', infoText, infoHandlers }) => (
    <TouchableOpacity
        style={[styles.analyticsListCard, !isDark && styles.cardLight]}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
    >
        <View style={styles.analyticsListHeader}>
            <View style={styles.analyticsListTitleRow}>
                <Text style={[styles.analyticsListTitle, !isDark && styles.textDark]}>{title}</Text>
                {infoText ? <InfoTip text={infoText} isDark={isDark} handlers={infoHandlers} /> : null}
            </View>
            {onPress ? (
                <Text style={[styles.analyticsListAction, { color: '#3b82f6' }]}>{actionLabel}</Text>
            ) : null}
        </View>
        {items?.length ? (
            items.slice(0, 4).map((item, idx) => (
                <View key={`${item.label}-${idx}`} style={styles.analyticsListItem}>
                    <View style={styles.analyticsListRow}>
                        <Text style={[styles.analyticsListLabel, { color: isDark ? '#cbd5e1' : '#0f172a' }]} numberOfLines={1}>
                            {item.label}
                        </Text>
                        <Text style={[styles.analyticsListValue, { color: isDark ? '#fff' : '#0f172a' }]} numberOfLines={1}>
                            {item.value}
                        </Text>
                    </View>
                    {Number.isFinite(item.ratio) && (
                        <View style={styles.analyticsListBar}>
                            <View style={[styles.analyticsListBarFill, { width: `${Math.min(100, Math.round(item.ratio * 100))}%` }]} />
                        </View>
                    )}
                </View>
            ))
        ) : (
            <Text style={[styles.analyticsListEmpty, { color: isDark ? '#94a3b8' : '#64748b' }]}>{emptyLabel}</Text>
        )}
    </TouchableOpacity>
);

const getPointerPos = (event) => {
    const native = event?.nativeEvent || {};
    let x = native.clientX;
    let y = native.clientY;
    if ((x == null || y == null) && typeof window !== 'undefined') {
        if (native.pageX != null) x = native.pageX - window.scrollX;
        if (native.pageY != null) y = native.pageY - window.scrollY;
    }
    if (x == null) x = native.locationX ?? 0;
    if (y == null) y = native.locationY ?? 0;
    return { x, y };
};

const InfoTip = ({ text, isDark, handlers }) => {
    const onShow = handlers?.onShow;
    const onMove = handlers?.onMove;
    const onHide = handlers?.onHide;
    const stopEvent = (event) => {
        event?.stopPropagation?.();
        event?.nativeEvent?.stopPropagation?.();
    };

    const handleShow = (event) => {
        stopEvent(event);
        if (!onShow) return;
        const { x, y } = getPointerPos(event);
        const payload = { text, x, y };
        onShow(payload, true);
    };

    const handleMove = (event) => {
        stopEvent(event);
        if (!onMove) return;
        const { x, y } = getPointerPos(event);
        if (x == null || y == null) return;
        onMove(x, y);
    };

    const handlePress = () => {
        stopEvent();
        if (!onShow) return;
        onShow({ text }, true);
    };

    return (
        <View style={styles.infoTipWrap}>
            <TouchableOpacity
                style={[styles.infoTipIcon, !isDark && styles.infoTipIconLight]}
                onPress={Platform.OS === 'web' ? undefined : handlePress}
                onMouseEnter={Platform.OS === 'web' ? handleShow : undefined}
                onMouseMove={Platform.OS === 'web' ? handleMove : undefined}
                onMouseLeave={Platform.OS === 'web' ? onHide : undefined}
                onMouseDown={Platform.OS === 'web' ? stopEvent : undefined}
                onPressIn={Platform.OS !== 'web' ? stopEvent : undefined}
                activeOpacity={0.8}
            >
                <Text style={[styles.infoTipText, !isDark && styles.textDark]}>i</Text>
            </TouchableOpacity>
        </View>
    );
};

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

const StatusLegend = ({ segments, total, hasData, isDark }) => (
    <View style={styles.analyticsStatusLegend}>
        {segments.map((seg) => (
            <View key={`${seg.label}-legend`} style={styles.analyticsStatusLegendItem}>
                <View style={[styles.analyticsStatusDot, { backgroundColor: seg.color, opacity: hasData ? 1 : 0.5 }]} />
                <Text
                    style={[styles.analyticsStatusLegendText, { color: isDark ? '#cbd5e1' : '#0f172a' }]}
                    numberOfLines={2}
                >
                    {seg.label}
                </Text>
                <View style={styles.analyticsStatusLegendMeta}>
                    <Text style={[styles.analyticsStatusLegendCount, { color: isDark ? '#e2e8f0' : '#0f172a' }]}>
                        {formatNumber(seg.value)}
                    </Text>
                    <Text style={[styles.analyticsStatusLegendValue, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                        {hasData ? Math.round((seg.value / total) * 100) : 0}%
                    </Text>
                </View>
            </View>
        ))}
    </View>
);

const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
};

const describeArc = (x, y, radius, startAngle, endAngle) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'L', x, y,
        'Z',
    ].join(' ');
};

const StatusPie = ({ segments = [], isDark, size = 140 }) => {
    const safeSegments = segments.map(seg => ({
        ...seg,
        value: Number.isFinite(seg.value) ? Math.max(0, seg.value) : 0,
    }));
    const total = safeSegments.reduce((sum, seg) => sum + seg.value, 0);
    const hasData = total > 0;
    const radius = size / 2;
    const innerRadius = radius * 0.62;
    let currentAngle = 0;

    return (
        <View style={styles.analyticsPieWrap}>
            <Svg width={size} height={size}>
                <G>
                    {hasData ? safeSegments.map(seg => {
                        if (!seg.value) return null;
                        const angle = (seg.value / total) * 360;
                        const path = describeArc(radius, radius, radius, currentAngle, currentAngle + angle);
                        currentAngle += angle;
                        return <Path key={seg.label} d={path} fill={seg.color} />;
                    }) : (
                        <Circle cx={radius} cy={radius} r={radius} fill={isDark ? 'rgba(148,163,184,0.2)' : '#e2e8f0'} />
                    )}
                    <Circle cx={radius} cy={radius} r={innerRadius} fill={isDark ? '#1e293b' : '#f8fafc'} />
                </G>
            </Svg>
            <StatusLegend segments={safeSegments} total={total || 1} hasData={hasData} isDark={isDark} />
        </View>
    );
};

const StatusStrip = ({ segments = [], isDark }) => {
    const safeSegments = segments.map(seg => ({
        ...seg,
        value: Number.isFinite(seg.value) ? Math.max(0, seg.value) : 0,
    }));
    const total = safeSegments.reduce((sum, seg) => sum + seg.value, 0);
    const hasData = total > 0;
    return (
        <View>
            <View style={[styles.analyticsStatusStrip, !hasData && styles.analyticsStatusStripEmpty]}>
                {hasData ? (
                    safeSegments.map((seg) => (
                        <View
                            key={seg.label}
                            style={[
                                styles.analyticsStatusSegment,
                                { flex: seg.value, backgroundColor: seg.color },
                            ]}
                        />
                    ))
                ) : (
                    <View style={styles.analyticsStatusStripEmptyFill} />
                )}
            </View>
            <StatusLegend segments={safeSegments} total={total || 1} hasData={hasData} isDark={isDark} />
        </View>
    );
};

const BoxPlotChart = ({
    buckets = [],
    width = 0,
    height = 200,
    isDark,
    p90 = 0,
    yLabel,
    yTicks = [],
    yHighlights,
    onBucketPress,
    onBucketHover,
    onBucketMove,
    onBucketLeave,
}) => {
    if (!width || !buckets.length) {
        return <Text style={styles.analyticsTrendEmptyText}>No data</Text>;
    }

    const yAxisWidth = 60;
    const labelPad = yAxisWidth;
    const padding = { top: 14, bottom: 26, left: 48, right: 12 };
    const plotHeight = height - padding.top - padding.bottom;
    const bucketCount = buckets.length;
    const plotWidth = Math.max(0, width - labelPad);
    const bucketWidth = (plotWidth - padding.left - padding.right) / bucketCount;
    const maxValue = Math.max(
        p90 || 0,
        ...buckets.map(b => (b.stats?.n ? (b.stats.p95 || b.stats.max || 0) : 0)),
        1
    );

    const yPos = (value) => padding.top + (1 - Math.min(value / maxValue, 1)) * plotHeight;
    const niceStep = (range) => {
        if (range <= 0) return 1;
        const rough = range / 4;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
        const residual = rough / magnitude;
        if (residual >= 5) return 5 * magnitude;
        if (residual >= 2) return 2 * magnitude;
        return magnitude;
    };
    const buildNiceTicks = (max) => {
        const step = niceStep(max);
        const ticks = [];
        const roundedMax = Math.ceil(max / step) * step;
        for (let val = 0; val <= roundedMax + step; val += step) {
            ticks.push(Math.round(val));
        }
        return ticks;
    };

    const highlightValues = [
        yHighlights?.max,
        yHighlights?.mean,
        yHighlights?.p75,
        yHighlights?.p50,
        yHighlights?.p25,
        yHighlights?.min,
    ].filter((val) => Number.isFinite(val));
    const baseTicks = buildNiceTicks(maxValue);
    const mergedTicks = Array.from(new Set([...baseTicks, ...highlightValues].map(val => Math.max(0, Math.round(val)))));
    mergedTicks.sort((a, b) => b - a);

    const mustValues = new Set(
        [yHighlights?.max, yHighlights?.mean]
            .filter(val => Number.isFinite(val))
            .map(val => Math.max(0, Math.round(val)))
    );
    const tickPositions = [];
    mergedTicks.forEach((value) => {
        const y = yPos(value);
        const last = tickPositions[tickPositions.length - 1];
        if (mustValues.has(value) || !last || Math.abs(last.y - y) > 14) {
            tickPositions.push({ value, y, isMust: mustValues.has(value) });
        }
    });
    const sortedByY = [...tickPositions].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sortedByY.length; i += 1) {
        if (sortedByY[i].y - sortedByY[i - 1].y < 12) {
            sortedByY[i].labelY = sortedByY[i - 1].y + 12;
        } else {
            sortedByY[i].labelY = sortedByY[i].y;
        }
    }
    if (sortedByY.length) {
        sortedByY[0].labelY = sortedByY[0].y;
    }
    const tickLabels = sortedByY.map((tick) => ({
        ...tick,
        labelY: Number.isFinite(tick.labelY) ? tick.labelY : tick.y,
    }));

    const medianPoints = buckets.map((b, idx) => {
        if (!b.stats?.n) return null;
        return {
            x: padding.left + bucketWidth * idx + bucketWidth / 2,
            y: yPos(b.stats.p50),
        };
    }).filter(Boolean);

    const meanPoints = buckets.map((b, idx) => {
        if (!b.stats?.n || !Number.isFinite(b.stats.mean)) return null;
        return {
            x: padding.left + bucketWidth * idx + bucketWidth / 2,
            y: yPos(b.stats.mean),
        };
    }).filter(Boolean);

    const medianPath = medianPoints.length
        ? medianPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        : null;

    const meanPath = meanPoints.length
        ? meanPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        : null;

    const hasData = buckets.some(b => b.stats?.n);
    const labelStep = bucketCount > 30 ? 5 : bucketCount > 24 ? 4 : bucketCount > 18 ? 3 : bucketCount > 12 ? 2 : 1;
    const rotateLabels = bucketCount > 10;
    const hideLabels = bucketWidth < 16;

    return (
        <View style={{ width, height: height + 56 }}>
            <View style={styles.analyticsBoxplotRow}>
                <View style={styles.analyticsBoxplotYAxis}>
                    <Text
                        style={[
                            styles.analyticsBoxplotYAxisText,
                            !isDark && styles.analyticsBoxplotYAxisTextLight,
                        ]}
                        numberOfLines={2}
                    >
                        {yLabel}
                    </Text>
                </View>
                <View style={{ width: plotWidth }}>
                    <View style={styles.analyticsBoxplotChart}>
                        <Svg width={plotWidth} height={height}>
                            <Rect
                                x={0}
                                y={0}
                                width={plotWidth}
                                height={height}
                                fill={isDark ? '#0f172a' : '#f8fafc'}
                            />

                            <Line
                                x1={padding.left - 2}
                                x2={padding.left - 2}
                                y1={padding.top}
                                y2={padding.top + plotHeight}
                                stroke={isDark ? 'rgba(148,163,184,0.4)' : '#cbd5e1'}
                                strokeWidth="1"
                            />

                            {tickLabels.map((tick) => (
                                <G key={`tick-${tick.value}`}>
                                    <Line
                                        x1={padding.left}
                                        x2={plotWidth - padding.right}
                                        y1={tick.y}
                                        y2={tick.y}
                                        stroke={isDark ? 'rgba(148,163,184,0.18)' : '#e2e8f0'}
                                        strokeWidth="1"
                                    />
                                    <Line
                                        x1={padding.left - 8}
                                        x2={padding.left - 2}
                                        y1={tick.y}
                                        y2={tick.y}
                                        stroke={isDark ? '#94a3b8' : '#64748b'}
                                        strokeWidth="1"
                                    />
                                    <SvgText
                                        x={padding.left - 10}
                                        y={tick.labelY + 4}
                                        fontSize={11}
                                        fill={isDark ? '#94a3b8' : '#64748b'}
                                        textAnchor="end"
                                        fontWeight={tick.isMust ? '700' : '500'}
                                    >
                                        {formatMoney(tick.value)}
                                    </SvgText>
                                </G>
                            ))}

                            {p90 > 0 && hasData && (
                                <Rect
                                    x={padding.left}
                                    y={yPos(p90)}
                                    width={plotWidth - padding.left - padding.right}
                                    height={padding.top + plotHeight - yPos(p90)}
                                    fill={isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(234, 88, 12, 0.08)'}
                                />
                            )}

                            {medianPath ? (
                                <Path
                                    d={medianPath}
                                    stroke={isDark ? '#38bdf8' : '#2563eb'}
                                    strokeWidth="2.5"
                                    fill="none"
                                />
                            ) : null}
                            {meanPath ? (
                                <Path
                                    d={meanPath}
                                    stroke={isDark ? '#f59e0b' : '#d97706'}
                                    strokeWidth="2"
                                    strokeDasharray="4 4"
                                    fill="none"
                                />
                            ) : null}

                            {buckets.map((bucket, idx) => {
                                const stats = bucket.stats;
                                const xCenter = padding.left + bucketWidth * idx + bucketWidth / 2;
                                const boxWidth = Math.min(22, Math.max(6, bucketWidth * 0.4));
                                if (!stats?.n) return null;

                                const boxTop = yPos(stats.p75);
                                const boxBottom = yPos(stats.p25);
                                const medianY = yPos(stats.p50);
                                const whiskerLow = yPos(stats.p5);
                                const whiskerHigh = yPos(stats.p95);

                                const showWhiskers = !bucket.smallSample;

                                return (
                                    <G key={bucket.key}>
                                        {showWhiskers && (
                                            <>
                                                <Path
                                                    d={`M ${xCenter} ${whiskerLow} L ${xCenter} ${whiskerHigh}`}
                                                    stroke={isDark ? '#94a3b8' : '#64748b'}
                                                    strokeWidth="1"
                                                />
                                                <Path
                                                    d={`M ${xCenter - boxWidth / 4} ${whiskerLow} L ${xCenter + boxWidth / 4} ${whiskerLow}`}
                                                    stroke={isDark ? '#94a3b8' : '#64748b'}
                                                    strokeWidth="1"
                                                />
                                                <Path
                                                    d={`M ${xCenter - boxWidth / 4} ${whiskerHigh} L ${xCenter + boxWidth / 4} ${whiskerHigh}`}
                                                    stroke={isDark ? '#94a3b8' : '#64748b'}
                                                    strokeWidth="1"
                                                />
                                            </>
                                        )}
                                        <Path
                                            d={`M ${xCenter - boxWidth / 2} ${boxTop} L ${xCenter + boxWidth / 2} ${boxTop} L ${xCenter + boxWidth / 2} ${boxBottom} L ${xCenter - boxWidth / 2} ${boxBottom} Z`}
                                            fill={isDark ? 'rgba(59,130,246,0.22)' : 'rgba(37,99,235,0.12)'}
                                            stroke={isDark ? '#60a5fa' : '#2563eb'}
                                            strokeWidth="1"
                                        />
                                        <Path
                                            d={`M ${xCenter - boxWidth / 2} ${medianY} L ${xCenter + boxWidth / 2} ${medianY}`}
                                            stroke={isDark ? '#38bdf8' : '#2563eb'}
                                            strokeWidth="2.5"
                                        />
                                    </G>
                                );
                            })}
                        </Svg>
                        <View style={styles.analyticsBoxplotHitRow}>
                            {buckets.map((bucket, idx) => (
                                <TouchableOpacity
                                    key={`${bucket.key}-hit`}
                                    style={[styles.analyticsBoxplotHit, { width: bucketWidth }]}
                                    activeOpacity={0.9}
                                    onPress={(event) => onBucketPress?.(bucket, event)}
                                    onMouseEnter={Platform.OS === 'web' ? (event) => onBucketHover?.(bucket, event) : undefined}
                                    onMouseMove={Platform.OS === 'web' ? onBucketMove : undefined}
                                    onMouseLeave={Platform.OS === 'web' ? onBucketLeave : undefined}
                                />
                            ))}
                        </View>
                    </View>

                    <View style={[styles.analyticsBoxplotLabels, { paddingLeft: padding.left, paddingRight: padding.right }]}>
                        {buckets.map((bucket, idx) => {
                            const showLabel = !hideLabels && (idx % labelStep === 0 || idx === bucketCount - 1);
                            const showWarning = showLabel && bucket.smallSample && bucketWidth > 22;
                            return (
                                <View key={`${bucket.key}-label`} style={[styles.analyticsBoxplotLabel, { width: bucketWidth }]}>
                                    {showLabel ? (
                                        <Text
                                            style={[
                                                styles.analyticsBoxplotLabelText,
                                                !isDark && styles.textSecondary,
                                                rotateLabels && styles.analyticsBoxplotLabelTextRotated,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {bucket.label}
                                        </Text>
                                    ) : null}
                                    {showWarning ? (
                                        <Ionicons name="warning" size={10} color={isDark ? '#f59e0b' : '#d97706'} />
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                </View>
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

const LabeledBarChart = ({ title, series, labels, formatter, isDark, color = '#3b82f6', subtitle, barHeight = 70, cardless = false }) => {
    const max = Math.max(...series, 1);
    const trackHeight = barHeight + 8;
    const barsHeight = trackHeight + 22;
    const trackWidth = series.length <= 4 ? '45%' : series.length <= 6 ? '55%' : series.length <= 9 ? '65%' : '75%';
    return (
        <View style={[cardless ? styles.analyticsChartBare : styles.analyticsChartCard, !cardless && !isDark && styles.cardLight]}>
            <View style={styles.analyticsChartHeader}>
                <Text style={[styles.analyticsChartTitle, !isDark && styles.textDark]}>{title}</Text>
                {subtitle ? <Text style={[styles.analyticsChartSubtitle, !isDark && styles.textSecondary]}>{subtitle}</Text> : null}
            </View>
            <View style={[styles.analyticsChartBars, { height: barsHeight }]}>
                {series.map((value, idx) => {
                    const height = 8 + Math.round((value / max) * barHeight);
                    return (
                        <View key={`chart-${idx}`} style={styles.analyticsChartColumn}>
                            <Text style={[styles.analyticsChartValue, !isDark && styles.textDark]} numberOfLines={1}>
                                {formatter(value)}
                            </Text>
                            <View style={[
                                styles.analyticsChartTrack,
                                { height: trackHeight, width: trackWidth },
                                !isDark && styles.analyticsChartTrackLight,
                            ]}>
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
export {
    sanitizeNumberInput,
    formatNumber,
    formatMoney,
    formatPercent,
    formatShortDate,
    DAY_MS,
    calcStats,
    hoursSince,
    normalizeStatus,
    COMPLETED_STATUSES,
    CANCELED_STATUSES,
    isReopenableStatus,
    getAnalyticsColumns,
    AnalyticsMetricCard,
    AnalyticsListCard,
    InfoTip,
    StatusPie,
    StatusStrip,
    BoxPlotChart,
    LabeledBarChart,
};
