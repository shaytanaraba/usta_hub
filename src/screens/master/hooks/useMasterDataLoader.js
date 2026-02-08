import { useCallback, useRef } from 'react';
import authService from '../../../services/auth';
import ordersService, { ORDER_STATUS } from '../../../services/orders';
import earningsService from '../../../services/earnings';
import { MASTER_TABS } from '../constants/domain';
import { normalizeMasterOrderList } from '../mappers/orderMappers';

export const useMasterDataLoader = ({
  authUser,
  user,
  filters,
  activeTab,
  setUser,
  setLoading,
  setRefreshing,
  setPagePool,
  setAvailableOrders,
  setAvailableOrdersMeta,
  setTotalPool,
  setMyOrders,
  setFinancials,
  setEarnings,
  setOrderHistory,
  setBalanceTransactions,
  setServiceTypes,
  setCancelReasons,
  setDistricts,
  perfRef,
  logPerf,
  timedCall,
  pageLimit,
  perfNow,
  roundMs,
  perfTargets,
  getCachedLookup,
  setCachedLookup,
}) => {
  const headerRefreshInFlightRef = useRef(false);

  const loadCriticalData = useCallback(async (options = {}) => {
    const { reset = true, reason = 'manual', meta = {}, forceUserReload = false } = options;
    const loadId = perfRef.current.criticalLoadSeq + 1;
    perfRef.current.criticalLoadSeq = loadId;
    const start = perfNow();
    if (reset) setLoading(true);
    logPerf('load_start', { loadId, reset, scope: 'critical', reason, filters, ...meta });
    try {
      let resolvedUser = null;
      const cachedUser = authUser || user;
      const shouldFetchCurrentUser = forceUserReload || !cachedUser?.id;
      if (shouldFetchCurrentUser) {
        resolvedUser = await timedCall(
          'auth.getCurrentUser',
          () => authService.getCurrentUser({ retries: 1, retryDelayMs: 350 }),
          { loadId },
        );
      } else {
        logPerf('user_resolve', { loadId, source: authUser?.id ? 'authUser' : 'localUser', skippedAuthFetch: true, reason });
      }
      if (resolvedUser) setUser(resolvedUser);
      else if (authUser && (!user || user.id !== authUser.id)) setUser(authUser);
      const effectiveUser = resolvedUser || cachedUser;
      if (effectiveUser) {
        const [poolRes, jobsRes, fin, poolMeta] = await Promise.all([
          timedCall('orders.getAvailableOrders', () => ordersService.getAvailableOrders(1, pageLimit, filters), { loadId }),
          timedCall('orders.getMasterOrders', () => ordersService.getMasterOrders(effectiveUser.id, 1, 100), { loadId }),
          timedCall('earnings.getMasterFinancialSummary', () => earningsService.getMasterFinancialSummary(effectiveUser.id), { loadId }),
          timedCall('orders.getAvailableOrdersMeta', () => ordersService.getAvailableOrdersMeta(), { loadId }),
        ]);
        if (perfRef.current.criticalLoadSeq !== loadId) return;
        const safePoolMeta = poolMeta || [];
        const filteredMetaCount = safePoolMeta.length
          ? safePoolMeta.filter((row) => {
              if (filters.urgency !== 'all' && row.urgency !== filters.urgency) return false;
              if (filters.service !== 'all' && row.service_type !== filters.service) return false;
              if (filters.area !== 'all' && row.area !== filters.area) return false;
              if (filters.pricing !== 'all' && row.pricing_type !== filters.pricing) return false;
              return true;
            }).length
          : 0;
        const resolvedPoolCount = typeof poolRes.count === 'number' ? poolRes.count : filteredMetaCount;
        const safePoolCount = poolRes.data.length > 0 && resolvedPoolCount === 0
          ? (filteredMetaCount || poolRes.data.length)
          : resolvedPoolCount;
        const normalizedPoolOrders = normalizeMasterOrderList(poolRes?.data, ORDER_STATUS.PLACED);
        const normalizedMyOrders = normalizeMasterOrderList(jobsRes?.data, ORDER_STATUS.CLAIMED);
        setAvailableOrders(normalizedPoolOrders);
        setTotalPool(safePoolCount);
        setMyOrders(normalizedMyOrders);
        setFinancials(fin);
        const shouldKeepMeta = safePoolMeta.length === 0 && (typeof poolRes.count === 'number' ? poolRes.count > 0 : poolRes.data.length > 0);
        setAvailableOrdersMeta((prev) => (shouldKeepMeta ? prev : safePoolMeta));
      }
    } catch (e) {
      console.error(e);
      logPerf('load_error', { loadId, scope: 'critical', error: e?.message });
    } finally {
      if (perfRef.current.criticalLoadSeq !== loadId) return;
      const ms = roundMs(perfNow() - start);
      logPerf('load_done', {
        loadId,
        ms,
        reset,
        scope: 'critical',
        targetMs: perfTargets.initialLoad,
        withinTarget: ms <= perfTargets.initialLoad,
        reason,
        ...meta,
      });
      if (reset && !perfRef.current.firstDataLogged) {
        perfRef.current.firstDataLogged = true;
        const firstMs = roundMs(perfNow() - perfRef.current.mountTs);
        logPerf('first_data_ready', {
          ms: firstMs,
          targetMs: perfTargets.initialLoad,
          withinTarget: firstMs <= perfTargets.initialLoad,
        });
      }
      setLoading(false);
    }
  }, [
    authUser,
    filters,
    logPerf,
    pageLimit,
    perfNow,
    perfRef,
    perfTargets.initialLoad,
    roundMs,
    setAvailableOrders,
    setAvailableOrdersMeta,
    setFinancials,
    setLoading,
    setMyOrders,
    setTotalPool,
    setUser,
    timedCall,
    user,
  ]);

  const loadAccountData = useCallback(async (options = {}) => {
    const { reason = 'manual', forceLookups = false } = options;
    const loadId = perfRef.current.accountLoadSeq + 1;
    perfRef.current.accountLoadSeq = loadId;
    const start = perfNow();
    logPerf('load_start', { loadId, reset: false, scope: 'account', reason });
    try {
      const effectiveUser = authUser || user;
      if (!effectiveUser) return;
      const cachedServiceTypes = forceLookups ? null : getCachedLookup('serviceTypes');
      const cachedCancelReasons = forceLookups ? null : getCachedLookup('cancelReasons');
      const cachedDistricts = forceLookups ? null : getCachedLookup('districts');

      const svcTypesPromise = cachedServiceTypes
        ? Promise.resolve(cachedServiceTypes)
        : timedCall('orders.getServiceTypes', () => ordersService.getServiceTypes(), { loadId, scope: 'account' })
            .then((res) => { setCachedLookup('serviceTypes', res || []); return res || []; });
      const cancelPromise = cachedCancelReasons
        ? Promise.resolve(cachedCancelReasons)
        : timedCall('orders.getCancellationReasons', () => ordersService.getCancellationReasons('master'), { loadId, scope: 'account' })
            .then((res) => { setCachedLookup('cancelReasons', res || []); return res || []; });
      const districtsPromise = cachedDistricts
        ? Promise.resolve(cachedDistricts)
        : timedCall('orders.getDistricts', () => ordersService.getDistricts(), { loadId, scope: 'account' })
            .then((res) => { setCachedLookup('districts', res || []); return res || []; });

      const [earn, hist, balTx, svcTypes, reasons, districtList] = await Promise.all([
        timedCall('earnings.getMasterEarnings', () => earningsService.getMasterEarnings(effectiveUser.id), { loadId, scope: 'account' }),
        timedCall('orders.getMasterOrderHistory', () => ordersService.getMasterOrderHistory(effectiveUser.id), { loadId, scope: 'account' }),
        timedCall('earnings.getBalanceTransactions', () => earningsService.getBalanceTransactions(effectiveUser.id), { loadId, scope: 'account' }),
        svcTypesPromise,
        cancelPromise,
        districtsPromise,
      ]);
      if (perfRef.current.accountLoadSeq !== loadId) return;
      setEarnings(earn);
      setOrderHistory(hist);
      setBalanceTransactions(balTx);
      setServiceTypes(svcTypes || []);
      setCancelReasons(reasons || []);
      setDistricts(districtList || []);
      perfRef.current.accountLoaded = true;
      perfRef.current.accountLoadedAt = Date.now();
    } catch (e) {
      console.error(e);
      logPerf('load_error', { loadId, scope: 'account', error: e?.message });
    } finally {
      if (perfRef.current.accountLoadSeq !== loadId) return;
      const ms = roundMs(perfNow() - start);
      logPerf('load_done', {
        loadId,
        ms,
        reset: false,
        scope: 'account',
        reason,
      });
    }
  }, [
    authUser,
    getCachedLookup,
    logPerf,
    perfNow,
    perfRef,
    roundMs,
    setBalanceTransactions,
    setCachedLookup,
    setCancelReasons,
    setDistricts,
    setEarnings,
    setOrderHistory,
    setServiceTypes,
    timedCall,
    user,
  ]);

  const reloadPool = useCallback(async (meta = {}) => {
    const loadId = perfRef.current.poolLoadSeq + 1;
    perfRef.current.poolLoadSeq = loadId;
    const start = perfNow();
    logPerf('reload_pool_start', { filters, loadId, ...meta });
    try {
      setPagePool(1);
      const [res, poolMeta] = await Promise.all([
        timedCall('orders.getAvailableOrders', () => ordersService.getAvailableOrders(1, pageLimit, filters), { flow: 'reloadPool', loadId }),
        timedCall('orders.getAvailableOrdersMeta', () => ordersService.getAvailableOrdersMeta(), { flow: 'reloadPool', loadId }),
      ]);
      if (perfRef.current.poolLoadSeq !== loadId) return;
      const safePoolMeta = poolMeta || [];
      const filteredMetaCount = safePoolMeta.length
        ? safePoolMeta.filter((row) => {
            if (filters.urgency !== 'all' && row.urgency !== filters.urgency) return false;
            if (filters.service !== 'all' && row.service_type !== filters.service) return false;
            if (filters.area !== 'all' && row.area !== filters.area) return false;
            if (filters.pricing !== 'all' && row.pricing_type !== filters.pricing) return false;
            return true;
          }).length
        : 0;
      const resolvedPoolCount = typeof res.count === 'number' ? res.count : filteredMetaCount;
      const safePoolCount = res.data.length > 0 && resolvedPoolCount === 0
        ? (filteredMetaCount || res.data.length)
        : resolvedPoolCount;
      setAvailableOrders(normalizeMasterOrderList(res?.data, ORDER_STATUS.PLACED));
      setTotalPool(safePoolCount);
      const shouldKeepMeta = safePoolMeta.length === 0 && (typeof res.count === 'number' ? res.count > 0 : res.data.length > 0);
      setAvailableOrdersMeta((prev) => (shouldKeepMeta ? prev : safePoolMeta));
    } catch (e) {
      console.error(e);
      logPerf('reload_pool_error', { error: e?.message, loadId, ...meta });
    } finally {
      if (perfRef.current.poolLoadSeq !== loadId) return;
      const ms = roundMs(perfNow() - start);
      logPerf('reload_pool_done', {
        ms,
        targetMs: perfTargets.reloadPool,
        withinTarget: ms <= perfTargets.reloadPool,
        loadId,
        ...meta,
      });
    }
  }, [
    filters,
    logPerf,
    pageLimit,
    perfNow,
    perfRef,
    perfTargets.reloadPool,
    roundMs,
    setAvailableOrders,
    setAvailableOrdersMeta,
    setPagePool,
    setTotalPool,
    timedCall,
  ]);

  const onRefresh = useCallback(async () => {
    const start = perfNow();
    setRefreshing(true);
    if (activeTab === MASTER_TABS.ACCOUNT) {
      await Promise.all([
        loadCriticalData({ reset: false, reason: 'pull_to_refresh' }),
        loadAccountData({ reason: 'pull_to_refresh' }),
      ]);
    } else {
      await loadCriticalData({ reset: false, reason: 'pull_to_refresh' });
    }
    setRefreshing(false);
    const ms = roundMs(perfNow() - start);
    logPerf('refresh_done', {
      ms,
      targetMs: perfTargets.refresh,
      withinTarget: ms <= perfTargets.refresh,
    });
  }, [activeTab, loadAccountData, loadCriticalData, logPerf, perfNow, perfTargets.refresh, roundMs, setRefreshing]);

  const onHeaderRefresh = useCallback(async () => {
    if (headerRefreshInFlightRef.current) {
      logPerf('refresh_skip', { reason: 'header_refresh_inflight' });
      return;
    }
    headerRefreshInFlightRef.current = true;
    try {
      await loadCriticalData({ reset: false, reason: 'header_refresh' });
    } finally {
      headerRefreshInFlightRef.current = false;
    }
  }, [loadCriticalData, logPerf]);

  return {
    loadCriticalData,
    loadAccountData,
    reloadPool,
    onRefresh,
    onHeaderRefresh,
  };
};

