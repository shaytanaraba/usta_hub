import { useCallback, useMemo, useRef } from 'react';
import { dispatcherDebug } from '../utils/logger';

const PERF_PREFIX = '[DispatcherDashboard][PERF]';

export default function useDispatcherPerf() {
  const marksRef = useRef({});

  const markStart = useCallback((label, data = {}) => {
    marksRef.current[label] = Date.now();
    dispatcherDebug('PERF', `${PERF_PREFIX} ${label}_start`, data);
  }, []);

  const markDone = useCallback((label, data = {}) => {
    const startedAt = marksRef.current[label];
    const ms = startedAt ? Date.now() - startedAt : null;
    dispatcherDebug('PERF', `${PERF_PREFIX} ${label}_done`, { ms, ...data });
  }, []);

  const markApiDone = useCallback((label, api, ms, ok = true, extra = {}) => {
    dispatcherDebug('PERF', `${PERF_PREFIX} api_done`, {
      label: `${label}.${api}`,
      ms,
      ok,
      ...extra,
    });
  }, []);

  return useMemo(() => ({
    markStart,
    markDone,
    markApiDone,
  }), [markStart, markDone, markApiDone]);
}
