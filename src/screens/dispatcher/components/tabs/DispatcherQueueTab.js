import React from 'react';
import {
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ATTENTION_FILTER_OPTIONS, SORT_OPTIONS, STATUS_OPTIONS, URGENCY_OPTIONS } from '../../constants';
import Pagination from '../Pagination';

export default function DispatcherQueueTab({
  styles,
  isDark,
  translations,
  language,
  statusCounts,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  showFilters,
  setShowFilters,
  setPickerModal,
  filterUrgency,
  setFilterUrgency,
  filterService,
  setFilterService,
  filterSort,
  setFilterSort,
  serviceTypes,
  needsAttentionCount,
  needsActionOrders,
  filterAttentionType,
  setFilterAttentionType,
  sortOrder,
  setSortOrder,
  showNeedsAttention,
  setShowNeedsAttention,
  setDetailsOrder,
  openAssignModal,
  canAssignMasters = true,
  filteredOrders,
  queueTotalCount,
  pageSize,
  loading,
  refreshing,
  handleRefresh,
  skeletonPulse,
  page,
  setPage,
  setShowPaymentModal,
  setPaymentOrder,
  setPaymentData,
  t,
  STATUS_COLORS,
  getOrderStatusLabel,
  getServiceLabel,
  getTimeAgo,
}) {
  const TRANSLATIONS = translations;

  const renderFilters = () => {
    const statusOptionsWithCounts = STATUS_OPTIONS.map((opt) => ({
      ...opt,
      count: statusCounts[opt.id] ?? 0,
    }));
    const currentStatusLabel = TRANSLATIONS[language][STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label]
      || STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label
      || statusFilter;

    return (
      <View style={styles.filtersContainer}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrapper, !isDark && styles.btnLight]}>
            <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
            <TextInput
              style={[styles.searchInput, !isDark && styles.textDark]}
              placeholder={TRANSLATIONS[language].placeholderSearch}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
                <Text style={styles.searchClearText}>{'\u2715'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.filterControlsRow}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, !isDark && styles.btnLight]}
            onPress={() => setViewMode((prev) => (prev === 'cards' ? 'compact' : 'cards'))}
          >
            <Text style={[styles.viewToggleBtnText, !isDark && styles.textDark]}>
              {viewMode === 'cards' ? '\u2630' : '\u25A6'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterShowBtn, showFilters && styles.filterShowBtnActive, !isDark && !showFilters && styles.btnLight]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={[styles.filterShowBtnText, showFilters && styles.filterShowBtnTextActive]}>
              {showFilters ? TRANSLATIONS[language].hideFilters : TRANSLATIONS[language].showFilters}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterDropdownRow}>
            <TouchableOpacity
              style={[styles.filterDropdown, !isDark && styles.btnLight]}
              onPress={() => setPickerModal({
                visible: true,
                title: TRANSLATIONS[language].pickerStatus,
                options: statusOptionsWithCounts,
                value: statusFilter,
                onChange: setStatusFilter,
              })}
            >
              <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                {currentStatusLabel} ({statusCounts[statusFilter] ?? 0})
              </Text>
              <Text style={styles.filterDropdownArrow}>{'\u25BE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterDropdown, !isDark && styles.btnLight]}
              onPress={() => setPickerModal({
                visible: true,
                title: TRANSLATIONS[language].pickerUrgency,
                options: URGENCY_OPTIONS,
                value: filterUrgency,
                onChange: setFilterUrgency,
              })}
            >
              <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                {TRANSLATIONS[language][URGENCY_OPTIONS.find((o) => o.id === filterUrgency)?.label] || URGENCY_OPTIONS.find((o) => o.id === filterUrgency)?.label || filterUrgency}
              </Text>
              <Text style={styles.filterDropdownArrow}>{'\u25BE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterDropdown, !isDark && styles.btnLight]}
              onPress={() => setPickerModal({
                visible: true,
                title: TRANSLATIONS[language].pickerService,
                options: [{ id: 'all', label: TRANSLATIONS[language].labelAllServices }, ...serviceTypes],
                value: filterService,
                onChange: setFilterService,
              })}
            >
              <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                {filterService === 'all' ? TRANSLATIONS[language].labelAllServices : serviceTypes.find((s) => s.id === filterService)?.label || filterService}
              </Text>
              <Text style={styles.filterDropdownArrow}>{'\u25BE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterDropdown, !isDark && styles.btnLight]}
              onPress={() => setPickerModal({
                visible: true,
                title: TRANSLATIONS[language].pickerSort,
                options: SORT_OPTIONS,
                value: filterSort,
                onChange: setFilterSort,
              })}
            >
              <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                {TRANSLATIONS[language][SORT_OPTIONS.find((o) => o.id === filterSort)?.label] || SORT_OPTIONS.find((o) => o.id === filterSort)?.label || filterSort}
              </Text>
              <Text style={styles.filterDropdownArrow}>{'\u25BE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={() => {
                setStatusFilter('Active');
                setFilterUrgency('all');
                setFilterService('all');
                setFilterSort('newest');
              }}
            >
              <Text style={styles.clearFiltersBtnText}>{TRANSLATIONS[language].clear}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderNeedsAttention = () => {
    const attentionDisplayCount = needsAttentionCount || needsActionOrders.length;
    if (attentionDisplayCount === 0) return null;

    const filteredAttention = needsActionOrders.filter((order) => {
      if (filterAttentionType === 'All') return true;
      if (filterAttentionType === 'Stuck' && order.status !== 'completed' && !order.is_disputed) return true;
      if (filterAttentionType === 'Disputed' && order.is_disputed) return true;
      if (filterAttentionType === 'Payment' && order.status === 'completed') return true;
      return false;
    });

    const sortedNeedsAction = [...filteredAttention].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    if (sortedNeedsAction.length === 0 && filterAttentionType !== 'All') {
      return (
        <View style={styles.attentionContainer}>
          <View style={styles.attentionHeaderRow}>
            <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
              <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>
                ! {TRANSLATIONS[language].needsAttention} ({attentionDisplayCount})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.miniFilterBtn, !isDark && styles.btnLight]}
              onPress={() => setPickerModal({
                visible: true,
                title: TRANSLATIONS[language].pickerErrorType,
                options: ATTENTION_FILTER_OPTIONS,
                value: filterAttentionType,
                onChange: setFilterAttentionType,
              })}
            >
              <Text style={styles.miniFilterText}>
                {TRANSLATIONS[language][ATTENTION_FILTER_OPTIONS.find((o) => o.id === filterAttentionType)?.label] || TRANSLATIONS[language][filterAttentionType] || filterAttentionType}
              </Text>
              <Text style={styles.miniFilterArrow}>{'\u25BE'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 10 }}>{TRANSLATIONS[language].msgNoMatch}</Text>
        </View>
      );
    }

    return (
      <View style={styles.attentionContainer}>
        <View style={styles.attentionHeaderRow}>
          <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>
              ! {TRANSLATIONS[language].needsAttention} ({attentionDisplayCount})
            </Text>
            <Text style={[styles.attentionChevron, !isDark && styles.textSecondary]}>{showNeedsAttention ? '^' : '\u25BE'}</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {showNeedsAttention && (
              <TouchableOpacity
                style={[styles.miniFilterBtn, !isDark && styles.btnLight]}
                onPress={() => setPickerModal({
                  visible: true,
                  title: TRANSLATIONS[language].pickerErrorType,
                  options: ATTENTION_FILTER_OPTIONS,
                  value: filterAttentionType,
                  onChange: setFilterAttentionType,
                })}
              >
                <Text style={styles.miniFilterText}>
                  {TRANSLATIONS[language][ATTENTION_FILTER_OPTIONS.find((o) => o.id === filterAttentionType)?.label] || TRANSLATIONS[language][filterAttentionType] || filterAttentionType}
                </Text>
                <Text style={styles.miniFilterArrow}>{'\u25BE'}</Text>
              </TouchableOpacity>
            )}

            {showNeedsAttention && (
              <TouchableOpacity style={styles.cleanSortBtn} onPress={() => setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'))}>
                <Text style={styles.cleanSortText}>
                  {sortOrder === 'newest' ? TRANSLATIONS[language].btnSortNewest : TRANSLATIONS[language].btnSortOldest}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {showNeedsAttention && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attentionScroll}>
            {sortedNeedsAction.map((order) => (
              <TouchableOpacity key={order.id} style={[styles.attentionCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(order)}>
                <Text style={styles.attentionBadge}>
                  {order.is_disputed
                    ? TRANSLATIONS[language].badgeDispute
                    : order.status === 'completed'
                      ? TRANSLATIONS[language].badgeUnpaid
                      : order.status?.includes('canceled')
                        ? (TRANSLATIONS[language].badgeCanceled || 'Canceled')
                        : TRANSLATIONS[language].badgeStuck}
                </Text>
                <Text style={[styles.attentionService, !isDark && styles.textDark]}>{getServiceLabel(order.service_type, t)}</Text>
                <Text style={[styles.attentionAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{order.full_address}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  const renderCompactRow = ({ item }) => (
    <TouchableOpacity style={[styles.compactRow, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
      <View style={[styles.compactStatusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
        <Text style={styles.compactStatusText}>{getOrderStatusLabel(item.status, t)}</Text>
      </View>
      <View style={styles.compactMain}>
        <View style={styles.compactTopRow}>
          <Text style={[styles.compactId, !isDark && styles.textSecondary]}>#{item.id?.slice(-6)}</Text>
          <Text style={[styles.compactService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, t)}</Text>
          {item.urgency && item.urgency !== 'planned' && (
            <Text style={[styles.compactUrgency, item.urgency === 'emergency' && styles.compactUrgencyEmergency]}>
              {TRANSLATIONS[language][`urgency${item.urgency.charAt(0).toUpperCase() + item.urgency.slice(1)}`] || item.urgency.toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={[styles.compactAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{item.full_address}</Text>
        <View style={styles.compactBottomRow}>
          <Text style={[styles.compactClient, !isDark && styles.textDark]}>{item.client?.full_name || item.client_name || 'N/A'}</Text>
          {item.master && <Text style={styles.compactMaster}>{TRANSLATIONS[language].labelMasterPrefix}{item.master.full_name}</Text>}
          {item.final_price && <Text style={styles.compactPrice}>{item.final_price}c</Text>}
          {canAssignMasters && ['placed', 'reopened'].includes(item.status) && (
            <TouchableOpacity style={styles.compactAssignBtn} onPress={(e) => { e.stopPropagation?.(); openAssignModal(item); }}>
              <Text style={styles.compactAssignText}>{TRANSLATIONS[language].actionAssign}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.compactRight}>
        <Text style={styles.compactTime}>{getTimeAgo(item.created_at, t)}</Text>
        <Text style={[styles.compactChevron, !isDark && styles.textSecondary]}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const renderCard = ({ item }) => {
    const payAmount = item?.final_price ?? item?.initial_price ?? '-';
    return (
      <TouchableOpacity style={[styles.orderCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, t)}</Text>
          <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] }]}>
            <Text style={styles.cardStatusText}>{getOrderStatusLabel(item.status, t)}</Text>
          </View>
        </View>
        <Text style={[styles.cardAddr, !isDark && styles.textSecondary]} numberOfLines={2}>{item.full_address}</Text>
        <View style={styles.cardFooter}>
          <Text style={[styles.cardClient, !isDark && styles.textDark]}>{item.client?.full_name || item.client_name || 'N/A'}</Text>
          <Text style={styles.cardTime}>{getTimeAgo(item.created_at, t)}</Text>
        </View>
        {canAssignMasters && ['placed', 'reopened'].includes(item.status) && (
          <TouchableOpacity style={styles.cardAssignBtn} onPress={(e) => { e.stopPropagation?.(); openAssignModal(item); }}>
            <Text style={styles.cardAssignText}>{TRANSLATIONS[language].actionAssign}</Text>
          </TouchableOpacity>
        )}
        {item.status === 'completed' && (
          <TouchableOpacity
            style={styles.cardPayBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              setPaymentOrder(item);
              setPaymentData({
                finalAmount: item?.final_price !== null && item?.final_price !== undefined && item?.final_price !== ''
                  ? String(item.final_price)
                  : (item?.initial_price !== null && item?.initial_price !== undefined && item?.initial_price !== '' ? String(item.initial_price) : ''),
                reportReason: '',
                workPerformed: String(item?.work_performed || ''),
                hoursWorked: item?.hours_worked !== null && item?.hours_worked !== undefined && item?.hours_worked !== ''
                  ? String(item.hours_worked)
                  : '',
              });
              setShowPaymentModal(true);
            }}
          >
            <Text style={styles.cardPayText}>
              {TRANSLATIONS[language].btnPayWithAmount
                ? TRANSLATIONS[language].btnPayWithAmount.replace('{0}', payAmount)
                : `Pay ${payAmount}c`}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const totalPages = Math.max(1, Math.ceil((queueTotalCount || 0) / pageSize));
  if (loading && !refreshing) {
    const isCardsView = viewMode === 'cards';
    const skeletonCount = isCardsView ? 6 : 8;
    return (
      <View style={styles.queueContainer}>
        {renderNeedsAttention()}
        {renderFilters()}
        <View style={[styles.listContent, isCardsView && styles.skeletonGrid]}>
          {Array.from({ length: skeletonCount }).map((_, index) => (
            isCardsView ? (
              <Animated.View
                key={`skeleton-card-${index}`}
                style={[
                  styles.skeletonCard,
                  styles.skeletonCardGrid,
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
                <View style={styles.skeletonAction} />
              </Animated.View>
            ) : (
              <Animated.View
                key={`skeleton-row-${index}`}
                style={[
                  styles.skeletonCard,
                  styles.skeletonCompactRow,
                  !isDark && styles.skeletonCardLight,
                  { opacity: skeletonPulse },
                ]}
              >
                <View style={styles.skeletonCompactStatus} />
                <View style={styles.skeletonCompactMain}>
                  <View style={styles.skeletonCompactLinePrimary} />
                  <View style={styles.skeletonCompactLineSecondary} />
                  <View style={styles.skeletonCompactLineTertiary} />
                </View>
                <View style={styles.skeletonCompactMeta} />
              </Animated.View>
            )
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.queueContainer}>
      {renderNeedsAttention()}
      {renderFilters()}
      <FlatList
        data={filteredOrders}
        renderItem={viewMode === 'cards' ? renderCard : renderCompactRow}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'cards' ? 2 : 1}
        key={viewMode}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={isDark ? '#3b82f6' : '#0f172a'} />}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, !isDark && { color: '#64748b' }]}>{TRANSLATIONS[language].emptyList}</Text></View>}
        ListFooterComponent={<Pagination current={page} total={totalPages} onPageChange={setPage} styles={styles} />}
      />
    </View>
  );
}
