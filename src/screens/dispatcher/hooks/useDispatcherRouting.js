import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { DISPATCHER_TABS } from '../constants';

const DEFAULT_TAB = 'stats';
const TAB_PARAM_KEY = 'tab';
const TAB_QUERY_KEY = 'dtab';

const normalizeTab = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_TAB;
  return DISPATCHER_TABS.includes(value) ? value : DEFAULT_TAB;
};

const readTabFromUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeTab(params.get(TAB_QUERY_KEY));
  } catch (error) {
    return null;
  }
};

const writeTabToUrl = (tab, mode = 'push') => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(TAB_QUERY_KEY, tab);
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (mode === 'replace') {
      window.history.replaceState(window.history.state, '', next);
    } else {
      window.history.pushState(window.history.state, '', next);
    }
  } catch (error) {
    // ignore malformed URL edge cases
  }
};

export default function useDispatcherRouting({ navigation, route }) {
  const routeTab = useMemo(
    () => {
      const raw = route?.params?.[TAB_PARAM_KEY];
      return raw ? normalizeTab(raw) : null;
    },
    [route?.params?.[TAB_PARAM_KEY]]
  );
  const initialTab = useMemo(() => {
    const fromUrl = readTabFromUrl();
    return normalizeTab(routeTab || fromUrl || DEFAULT_TAB);
  }, [routeTab]);

  const [activeTab, setActiveTabState] = useState(initialTab);

  useEffect(() => {
    if (routeTab && routeTab !== activeTab) {
      setActiveTabState(routeTab);
    }
  }, [routeTab, activeTab]);

  useEffect(() => {
    if (route?.params?.[TAB_PARAM_KEY] !== activeTab) {
      navigation?.setParams?.({ [TAB_PARAM_KEY]: activeTab });
    }
  }, [navigation, route?.params, activeTab]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onPopState = () => {
      const fromUrl = readTabFromUrl() || DEFAULT_TAB;
      setActiveTabState(fromUrl);
      navigation?.setParams?.({ [TAB_PARAM_KEY]: fromUrl });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation]);

  const setActiveTab = useCallback((nextTab, { pushHistory = true } = {}) => {
    const normalized = normalizeTab(nextTab);
    setActiveTabState(normalized);
    navigation?.setParams?.({ [TAB_PARAM_KEY]: normalized });
    if (Platform.OS === 'web') {
      writeTabToUrl(normalized, pushHistory ? 'push' : 'replace');
    }
  }, [navigation]);

  return {
    activeTab,
    setActiveTab,
  };
}
