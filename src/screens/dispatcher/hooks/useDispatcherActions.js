import { useCallback, useRef } from 'react';

export default function useDispatcherActions({ setOrders, setDetailsOrder }) {
  const refreshTimerRef = useRef(null);

  const patchOrderInState = useCallback((orderId, patch) => {
    if (!orderId) return;
    setOrders((prev) => (prev || []).map((order) => (
      order?.id === orderId ? { ...order, ...patch } : order
    )));
    if (setDetailsOrder) {
      setDetailsOrder((prev) => (prev?.id === orderId ? { ...prev, ...patch } : prev));
    }
  }, [setOrders, setDetailsOrder]);

  const removeOrderFromState = useCallback((orderId) => {
    if (!orderId) return;
    setOrders((prev) => (prev || []).filter((order) => order?.id !== orderId));
    if (setDetailsOrder) {
      setDetailsOrder((prev) => (prev?.id === orderId ? null : prev));
    }
  }, [setOrders, setDetailsOrder]);

  const addOrderToState = useCallback((order) => {
    if (!order?.id) return;
    setOrders((prev) => {
      const next = prev || [];
      if (next.some((item) => item?.id === order.id)) {
        return next.map((item) => (item?.id === order.id ? { ...item, ...order } : item));
      }
      return [order, ...next];
    });
  }, [setOrders]);

  const scheduleBackgroundRefresh = useCallback((refreshFn, delayMs = 250) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshFn?.({ reason: 'background_after_action' });
    }, delayMs);
  }, []);

  return {
    patchOrderInState,
    removeOrderFromState,
    addOrderToState,
    scheduleBackgroundRefresh,
  };
}

