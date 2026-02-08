import { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import ordersService, { ORDER_STATUS } from '../../../services/orders';
import { normalizeMasterOrder, normalizeMasterOrderList } from '../mappers/orderMappers';

export const useMasterActions = ({
  availableOrders,
  financials,
  loadCriticalData,
  localizeSuccessMessage,
  normalizeActionMessage,
  actionSuccessMessage,
  safeT,
  showToast,
  timedCall,
  logPerf,
  removeOrderById,
  upsertOrderById,
  activeSheetOrder,
  myOrders,
  userId,
  cancelReasons,
  setCancelReasons,
  getCachedLookup,
  setCachedLookup,
  setSelectedPoolOrderId,
  setActiveSheetOrder,
  setSheetSnap,
  setAvailableOrders,
  setTotalPool,
  setMyOrders,
  setModalState,
  filters,
  totalPages,
  perfRef,
  setPagePool,
  pageLimit,
  perfNow,
  roundMs,
  perfTargets,
  t,
}) => {
  const [actionLoading, setActionLoading] = useState(false);

  const handleClaim = useCallback(async (orderId) => {
    const actionStart = perfNow();
    let success = false;
    const order = availableOrders.find((o) => o.id === orderId);
    const priceForCommission = Number(order?.final_price ?? order?.initial_price ?? 0);
    if (priceForCommission > 0) {
      const estimatedCommission = priceForCommission * 0.20;
      const projectedBalance = (financials?.prepaidBalance || 0) - estimatedCommission;
      if (projectedBalance < 0 && financials?.prepaidBalance > 0) {
        showToast?.(safeT('warningBalanceMayGoNegative', 'After completion, your balance may go negative. Please top up in advance.'), 'warning');
      }
    }

    setActionLoading(true);
    try {
      const result = await timedCall('orders.claimOrder', () => ordersService.claimOrder(orderId), { flow: 'action', action: 'claim' });
      if (result.success) {
        success = true;
        showToast?.(localizeSuccessMessage(result.message, 'toastOrderClaimed', 'Order claimed!'), 'success');
        if (Array.isArray(result.warnings) && result.warnings.includes('TIME_CONFLICT')) {
          showToast?.(safeT('warningTimeConflict', 'Potential time conflict with another planned order'), 'warning');
        }
        setSelectedPoolOrderId(null);
        const claimedOrder = normalizeMasterOrder(
          result.order || (order ? { ...order, status: ORDER_STATUS.CLAIMED } : { id: orderId, status: ORDER_STATUS.CLAIMED }),
          ORDER_STATUS.CLAIMED,
        );
        if (!claimedOrder) return;
        setActiveSheetOrder(claimedOrder);
        setSheetSnap('full');
        setAvailableOrders((prev) => removeOrderById(prev, orderId));
        setTotalPool((prev) => Math.max(0, prev - 1));
        setMyOrders((prev) => upsertOrderById(prev, claimedOrder));
        loadCriticalData({ reset: false, reason: 'claim' });
      } else {
        showToast?.(normalizeActionMessage(result.message, result.blockers), 'error');
      }
    } finally {
      const ms = roundMs(perfNow() - actionStart);
      logPerf('action_done', {
        action: 'claim',
        ok: success,
        ms,
        targetMs: perfTargets.action,
        withinTarget: ms <= perfTargets.action,
      });
      setActionLoading(false);
    }
  }, [
    availableOrders,
    financials?.prepaidBalance,
    loadCriticalData,
    localizeSuccessMessage,
    logPerf,
    normalizeActionMessage,
    perfNow,
    perfTargets.action,
    removeOrderById,
    roundMs,
    safeT,
    setActiveSheetOrder,
    setAvailableOrders,
    setMyOrders,
    setSelectedPoolOrderId,
    setSheetSnap,
    setTotalPool,
    showToast,
    timedCall,
    upsertOrderById,
  ]);

  const handleAction = useCallback(async (fn, ...args) => {
    const actionStart = perfNow();
    let success = false;
    const action =
      fn === ordersService.startJob ? 'start'
        : fn === ordersService.completeJob ? 'complete'
          : fn === ordersService.refuseJob ? 'refuse'
            : 'action';
    setActionLoading(true);
    try {
      const res = await timedCall(`orders.${action}`, () => fn(...args), { flow: 'action', action });
      if (res.success) {
        success = true;
        showToast?.(actionSuccessMessage(fn, res.message), 'success');
        setModalState({ type: null, order: null });
        if (res.order) {
          const normalizedOrder = normalizeMasterOrder(res.order, ORDER_STATUS.CLAIMED);
          if (normalizedOrder) {
            setMyOrders((prev) => upsertOrderById(prev, normalizedOrder));
            if (normalizedOrder.id === activeSheetOrder?.id) {
              setActiveSheetOrder(normalizedOrder);
            }
          }
        }
        loadCriticalData({ reset: false, reason: action });
      } else {
        showToast?.(normalizeActionMessage(res.message, res.blockers), 'error');
      }
      return res;
    } catch (e) {
      showToast?.(safeT('errorActionFailed', 'Action failed'), 'error');
    } finally {
      const ms = roundMs(perfNow() - actionStart);
      logPerf('action_done', {
        action,
        ok: success,
        ms,
        targetMs: perfTargets.action,
        withinTarget: ms <= perfTargets.action,
      });
      setActionLoading(false);
    }
  }, [
    actionSuccessMessage,
    activeSheetOrder?.id,
    loadCriticalData,
    logPerf,
    normalizeActionMessage,
    perfNow,
    perfTargets.action,
    roundMs,
    safeT,
    setActiveSheetOrder,
    setModalState,
    setMyOrders,
    showToast,
    timedCall,
    upsertOrderById,
  ]);

  const handleStart = useCallback(async (orderId) => {
    const res = await handleAction(ordersService.startJob, orderId, userId);
    if (res?.success) {
      const updatedOrder = res.order || myOrders.find((o) => o.id === orderId) || activeSheetOrder;
      if (updatedOrder) {
        setActiveSheetOrder(updatedOrder);
      }
      setSheetSnap('full');
    }
    return res;
  }, [activeSheetOrder, handleAction, myOrders, setActiveSheetOrder, setSheetSnap, userId]);

  const ensureCancelReasons = useCallback(async () => {
    if (cancelReasons.length > 0) return true;
    const cached = getCachedLookup('cancelReasons');
    if (cached?.length) {
      setCancelReasons(cached);
      return true;
    }
    try {
      const reasons = await timedCall('orders.getCancellationReasons', () => ordersService.getCancellationReasons('master'), { flow: 'prefetch' });
      const safeReasons = reasons || [];
      setCancelReasons(safeReasons);
      setCachedLookup('cancelReasons', safeReasons);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }, [cancelReasons.length, getCachedLookup, setCachedLookup, setCancelReasons, timedCall]);

  const handleOpenComplete = useCallback((order) => {
    if (!order) return;
    setModalState({ type: 'complete', order });
  }, [setModalState]);

  const handleOpenRefuse = useCallback(async (order) => {
    if (!order) return;
    await ensureCancelReasons();
    setModalState({ type: 'refuse', order });
  }, [ensureCancelReasons, setModalState]);

  const handleCopyAddress = useCallback((text) => {
    if (!text) {
      showToast?.(t('toastClipboardEmpty') || 'Nothing to copy', 'info');
      return;
    }
    Clipboard.setStringAsync(text);
    showToast?.(t('toastCopied') || 'Copied', 'success');
  }, [showToast, t]);

  const handleCopyPhone = useCallback((text) => {
    if (!text) {
      showToast?.(t('toastClipboardEmpty') || 'Nothing to copy', 'info');
      return;
    }
    Clipboard.setStringAsync(text);
    showToast?.(t('toastCopied') || 'Copied', 'success');
  }, [showToast, t]);

  const handlePoolPageChange = useCallback(async (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    const loadId = perfRef.current.pageLoadSeq + 1;
    perfRef.current.pageLoadSeq = loadId;
    const start = perfNow();
    setActionLoading(true);
    try {
      const res = await timedCall('orders.getAvailableOrders', () => ordersService.getAvailableOrders(nextPage, pageLimit, filters), {
        flow: 'page_change',
        page: nextPage,
        loadId,
      });
      if (perfRef.current.pageLoadSeq !== loadId) return;
      setAvailableOrders(normalizeMasterOrderList(res?.data, ORDER_STATUS.PLACED));
      setTotalPool(res.count);
      setPagePool(nextPage);
      setSelectedPoolOrderId(null);
    } catch (e) {
      console.error(e);
    } finally {
      if (perfRef.current.pageLoadSeq !== loadId) return;
      const ms = roundMs(perfNow() - start);
      logPerf('page_change_done', {
        page: nextPage,
        ms,
        targetMs: perfTargets.pageChange,
        withinTarget: ms <= perfTargets.pageChange,
      });
      setActionLoading(false);
    }
  }, [
    filters,
    logPerf,
    pageLimit,
    perfNow,
    perfRef,
    perfTargets.pageChange,
    roundMs,
    setAvailableOrders,
    setPagePool,
    setSelectedPoolOrderId,
    setTotalPool,
    timedCall,
    totalPages,
  ]);

  return {
    actionLoading,
    handleClaim,
    handleAction,
    handleStart,
    handleOpenComplete,
    handleOpenRefuse,
    handleCopyAddress,
    handleCopyPhone,
    handlePoolPageChange,
  };
};

