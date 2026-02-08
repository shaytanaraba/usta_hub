import { useCallback, useRef } from 'react';
import authService from '../../../services/auth';
import ordersService from '../../../services/orders';
import {
  getCachedMetadata,
  METADATA_KEYS,
  METADATA_TTL_MS,
  setCachedMetadata,
} from '../utils/metadataCache';
import { dispatcherError, dispatcherWarn } from '../utils/logger';

const EMPTY_STATUS_COUNTS = { Active: 0, Payment: 0, Confirmed: 0, Canceled: 0 };

export default function useDispatcherDataLoader({
  authUser,
  language,
  queueQuery,
  pageSize,
  refreshing,
  setRefreshing,
  setLoading,
  setUser,
  setOrders,
  setQueueTotalCount,
  setStatusCounts,
  setAttentionOrders,
  setAttentionCount,
  setServiceTypes,
  setDistricts,
  setDispatchers,
  setPlatformSettings,
  setStatsSummary,
  perf,
}) {
  const queueLoadIdRef = useRef(0);
  const statsLoadIdRef = useRef(0);

  const resolveCurrentUser = useCallback(async () => {
    if (authUser?.id) {
      return authUser;
    }
    try {
      const fromAuth = await authService.getCurrentUser({ retries: 1, retryDelayMs: 350 });
      return fromAuth || null;
    } catch (error) {
      return null;
    }
  }, [authUser]);

  const loadQueueData = useCallback(async ({ reason = 'manual', page = null } = {}) => {
    const loadId = queueLoadIdRef.current + 1;
    queueLoadIdRef.current = loadId;
    const isStale = () => loadId !== queueLoadIdRef.current;

    if (!refreshing) {
      setLoading(true);
    }
    perf?.markStart?.('queue_load', { reason, loadId, ...queueQuery, page: page || queueQuery.page });
    try {
      const currentUser = await resolveCurrentUser();
      if (isStale()) return;
      setUser(currentUser);
      if (!currentUser?.id) {
        if (isStale()) return;
        setOrders([]);
        setQueueTotalCount(0);
        setStatusCounts(EMPTY_STATUS_COUNTS);
        setAttentionOrders([]);
        setAttentionCount(0);
        return;
      }

      const apiStartedAt = Date.now();
      const response = await ordersService.getDispatcherOrdersPage(currentUser.id, {
        page: page || queueQuery.page,
        limit: pageSize,
        status: queueQuery.statusFilter,
        search: queueQuery.searchQuery,
        urgency: queueQuery.filterUrgency,
        serviceType: queueQuery.filterService,
        sort: queueQuery.filterSort,
      });
      perf?.markApiDone?.('queue_load', 'orders_page', Date.now() - apiStartedAt, true, {
        loadId,
        source: response?.source,
        rows: response?.data?.length || 0,
        totalCount: response?.count || 0,
      });

      if (isStale()) return;
      setOrders(response?.data || []);
      setQueueTotalCount(Number(response?.count || 0));
      setStatusCounts(response?.statusCounts || EMPTY_STATUS_COUNTS);
      setAttentionOrders(response?.attentionItems || []);
      setAttentionCount(Number(response?.attentionCount || 0));
    } catch (error) {
      if (!isStale()) {
        dispatcherError('DataLoader', 'loadQueueData error', error);
      }
      if (isStale()) return;
      setOrders([]);
      setQueueTotalCount(0);
      setStatusCounts(EMPTY_STATUS_COUNTS);
      setAttentionOrders([]);
      setAttentionCount(0);
    } finally {
      if (!isStale()) {
        setLoading(false);
        perf?.markDone?.('queue_load', { reason, loadId });
      }
    }
  }, [
    refreshing,
    setLoading,
    perf,
    queueQuery,
    resolveCurrentUser,
    setUser,
    setOrders,
    setQueueTotalCount,
    setStatusCounts,
    setAttentionOrders,
    setAttentionCount,
    pageSize,
  ]);

  const loadServiceTypes = useCallback(async () => {
    const cacheKey = METADATA_KEYS.SERVICE_TYPES;
    const cached = await getCachedMetadata(cacheKey, METADATA_TTL_MS.SERVICE_TYPES);
    if (cached?.length) {
      setServiceTypes(cached);
      return cached;
    }
    try {
      const apiStartedAt = Date.now();
      const types = await ordersService.getServiceTypes();
      perf?.markApiDone?.('metadata', 'serviceTypes', Date.now() - apiStartedAt, true, { count: types?.length || 0 });
      if (types && types.length > 0) {
        const labelField = language === 'ru' ? 'name_ru' : language === 'kg' ? 'name_kg' : 'name_en';
        const mapped = types.map((t) => ({
          id: t.code,
          label: t[labelField] || t.name_en,
        }));
        setServiceTypes(mapped);
        await setCachedMetadata(cacheKey, mapped);
        return mapped;
      }
    } catch (error) {
      dispatcherWarn('DataLoader', 'loadServiceTypes error', error);
    }
    return null;
  }, [language, perf, setServiceTypes]);

  const loadDistricts = useCallback(async () => {
    const cacheKey = METADATA_KEYS.DISTRICTS;
    const cached = await getCachedMetadata(cacheKey, METADATA_TTL_MS.DISTRICTS);
    if (cached?.length) {
      setDistricts(cached);
      return cached;
    }
    try {
      const apiStartedAt = Date.now();
      const data = await ordersService.getDistricts();
      perf?.markApiDone?.('metadata', 'districts', Date.now() - apiStartedAt, true, { count: data?.length || 0 });
      if (data && data.length > 0) {
        const labelField = language === 'ru' ? 'name_ru' : language === 'kg' ? 'name_kg' : 'name_en';
        const mapped = data.map((d) => ({
          id: d.code,
          label: d[labelField] || d.name_en,
          region: d.region,
        }));
        setDistricts(mapped);
        await setCachedMetadata(cacheKey, mapped);
        return mapped;
      }
    } catch (error) {
      dispatcherWarn('DataLoader', 'loadDistricts error', error);
    }
    return null;
  }, [language, perf, setDistricts]);

  const loadDispatchers = useCallback(async () => {
    const cacheKey = METADATA_KEYS.DISPATCHERS;
    const cached = await getCachedMetadata(cacheKey, METADATA_TTL_MS.DISPATCHERS);
    if (cached?.length) {
      setDispatchers(cached);
    }
    try {
      if (authService.getAllDispatchers) {
        const apiStartedAt = Date.now();
        const data = await authService.getAllDispatchers();
        perf?.markApiDone?.('metadata', 'dispatchers', Date.now() - apiStartedAt, true, { count: data?.length || 0 });
        const normalized = data || [];
        setDispatchers(normalized);
        await setCachedMetadata(cacheKey, normalized);
        return normalized;
      }
    } catch (error) {
      dispatcherWarn('DataLoader', 'loadDispatchers error', error);
    }
    return cached || [];
  }, [perf, setDispatchers]);

  const loadPlatformSettings = useCallback(async () => {
    const cacheKey = METADATA_KEYS.PLATFORM_SETTINGS;
    const cached = await getCachedMetadata(cacheKey, METADATA_TTL_MS.PLATFORM_SETTINGS);
    if (cached) {
      setPlatformSettings(cached);
    }
    try {
      const apiStartedAt = Date.now();
      const settings = await ordersService.getPlatformSettings();
      perf?.markApiDone?.('metadata', 'platformSettings', Date.now() - apiStartedAt, true);
      if (settings) {
        setPlatformSettings(settings);
        await setCachedMetadata(cacheKey, settings);
        return settings;
      }
    } catch (error) {
      dispatcherWarn('DataLoader', 'loadPlatformSettings error', error);
    }
    return cached || null;
  }, [perf, setPlatformSettings]);

  const loadMasters = useCallback(async () => {
    const cacheKey = METADATA_KEYS.MASTERS;
    const cached = await getCachedMetadata(cacheKey, METADATA_TTL_MS.MASTERS);
    if (cached?.length) {
      return cached;
    }
    try {
      const apiStartedAt = Date.now();
      const data = await ordersService.getAvailableMasters();
      perf?.markApiDone?.('metadata', 'masters', Date.now() - apiStartedAt, true, { count: data?.length || 0 });
      const normalized = data || [];
      await setCachedMetadata(cacheKey, normalized);
      return normalized;
    } catch (error) {
      dispatcherWarn('DataLoader', 'loadMasters error', error);
      return cached || [];
    }
  }, [perf]);

  const loadStatsSummary = useCallback(async (days = 7, reason = 'stats_load') => {
    const loadId = statsLoadIdRef.current + 1;
    statsLoadIdRef.current = loadId;
    const isStale = () => loadId !== statsLoadIdRef.current;

    try {
      const currentUser = await resolveCurrentUser();
      if (isStale()) return null;
      setUser(currentUser);
      if (!currentUser?.id) {
        if (isStale()) return null;
        setStatsSummary(null);
        return null;
      }
      const apiStartedAt = Date.now();
      const summary = await ordersService.getDispatcherStatsSummary(currentUser.id, days);
      perf?.markApiDone?.('stats', 'summary', Date.now() - apiStartedAt, true, { days, loadId });
      if (isStale()) return null;
      setStatsSummary(summary || null);
      return summary;
    } catch (error) {
      if (!isStale()) {
        dispatcherError('DataLoader', `${reason} error`, error);
      }
      if (isStale()) return null;
      setStatsSummary(null);
      return null;
    }
  }, [perf, resolveCurrentUser, setStatsSummary, setUser]);

  const onRefresh = useCallback(async ({ includeStats = false, statsDays = 7 } = {}) => {
    setRefreshing(true);
    try {
      await loadQueueData({ reason: 'pull_to_refresh' });
      if (includeStats) {
        await loadStatsSummary(statsDays, 'stats_refresh');
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadQueueData, loadStatsSummary, setRefreshing]);

  return {
    loadQueueData,
    loadServiceTypes,
    loadDistricts,
    loadDispatchers,
    loadPlatformSettings,
    loadStatsSummary,
    loadMasters,
    onRefresh,
  };
}
