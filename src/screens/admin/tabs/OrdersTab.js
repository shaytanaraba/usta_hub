import React from 'react';
import { ActivityIndicator, Animated, FlatList, Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Pagination } from '../../../components/ui/Pagination';
import { ATTENTION_FILTER_OPTIONS } from '../config/constants';
import { STATUS_COLORS, getOrderStatusLabel, getServiceLabel, getTimeAgo } from '../../../utils/orderHelpers';

export default function AdminOrdersTab(props) {
    const {
        TRANSLATIONS,
        filterAttentionType,
        filteredOrders,
        isDark,
        needsActionCount,
        needsActionOrders,
        onRefresh,
        openAssignModalFromQueue,
        openOrderDetails,
        queueLoading,
        queuePage,
        queueTotalCount,
        refreshing,
        renderFilters,
        renderHeader,
        setFilterAttentionType,
        setPickerModal,
        setQueuePage,
        setShowNeedsAttention,
        setSortOrder,
        showNeedsAttention,
        sortOrder,
        styles,
        t,
        viewMode,
    } = props;
// --- Needs Attention Section ---
        const renderNeedsAttention = () => {
            if (needsActionCount === 0) return null;

            // Filter Needs Attention
            const filteredAttention = needsActionOrders.filter(o => {
                if (filterAttentionType === 'All') return true;
                if (filterAttentionType === 'Stuck' && o.status !== 'completed' && !o.is_disputed) return true;
                if (filterAttentionType === 'Disputed' && o.is_disputed) return true;
                if (filterAttentionType === 'Payment' && o.status === 'completed') return true;
                if (filterAttentionType === 'Canceled' && String(o.status || '').includes('canceled')) return true;
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
                            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS.needsAttention || 'Needs Attention'} ({needsActionCount})</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.pickerErrorType || 'Issue Type',
                            options: ATTENTION_FILTER_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                            value: filterAttentionType,
                            onChange: setFilterAttentionType
                        })}>
                            <Text style={styles.miniFilterText}>{TRANSLATIONS[attentionFilterLabel] || filterAttentionType}</Text>
                            <Ionicons name="chevron-down" size={14} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>
                    <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 10 }}>{TRANSLATIONS.msgNoMatch || 'No matching orders'}</Text>
                </View>
            );

            return (
                <View style={styles.attentionContainer}>
                    <View style={styles.attentionHeaderRow}>
                        <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
                            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS.needsAttention || 'Needs Attention'} ({needsActionCount})</Text>
                            <Ionicons name={showNeedsAttention ? "chevron-up" : "chevron-down"} size={16} color={isDark ? "#94a3b8" : "#64748b"} />
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
                                    <Ionicons name="chevron-down" size={14} color="#94a3b8" />
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
                        {item.master && <Text style={styles.compactMaster}>{TRANSLATIONS.labelMasterPrefix || '? '}{item.master.full_name}</Text>}
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
                    <Ionicons name="chevron-forward" size={14} color={isDark ? "#94a3b8" : "#64748b"} />
                </View>
            </TouchableOpacity>
        );

        const pageSize = viewMode === 'cards' ? 20 : 10;
        const totalPages = Math.max(1, Math.ceil(queueTotalCount / pageSize));
        const paginatedOrders = filteredOrders;

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader(TRANSLATIONS.ordersQueue || TRANSLATIONS.orders || 'Orders')}

                {/* Needs Attention Section */}
                {renderNeedsAttention()}

                {/* Filters */}
                {renderFilters()}

                <View style={styles.paginationTopRow}>
                    <Pagination
                        currentPage={queuePage}
                        totalPages={totalPages}
                        onPageChange={setQueuePage}
                        className={styles.paginationTopCompact}
                    />
                </View>

                <FlatList
                    data={paginatedOrders}
                    keyExtractor={item => String(item.id)}
                    key={viewMode}
                    numColumns={viewMode === 'cards' ? 2 : 1}
                    renderItem={viewMode === 'cards' ? renderCard : renderCompactRow}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#3b82f6" : "#0f172a"} />}
                    ListEmptyComponent={
                        queueLoading
                            ? <View style={styles.empty}><ActivityIndicator size="small" color={isDark ? '#3b82f6' : '#0f172a'} /></View>
                            : <View style={styles.empty}><Text style={[styles.emptyText, !isDark && styles.textSecondary]}>{TRANSLATIONS.emptyList || 'No orders found'}</Text></View>
                    }
                />
            </View>
        );
}
