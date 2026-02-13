import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { DISPATCHER_TABS } from '../constants';

const TAB_PARAM_KEY = 'tab';
const TAB_QUERY_KEY = 'dtab';

const normalizeTab = (value, tabs, fallbackTab) => {
  if (!value || typeof value !== 'string') return fallbackTab;
  return tabs.includes(value) ? value : fallbackTab;
};

const readTabFromUrl = (tabs, fallbackTab) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return normalizeTab(params.get(TAB_QUERY_KEY), tabs, fallbackTab);
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

export default function useDispatcherRouting({ navigation, route, tabs = DISPATCHER_TABS }) {
  const allowedTabs = useMemo(
    () => (Array.isArray(tabs) && tabs.length ? tabs : DISPATCHER_TABS),
    [tabs]
  );
  const defaultTab = allowedTabs[0] || DISPATCHER_TABS[0];
  const routeTab = useMemo(
    () => {
      const raw = route?.params?.[TAB_PARAM_KEY];
      return raw ? normalizeTab(raw, allowedTabs, defaultTab) : null;
    },
    [route?.params?.[TAB_PARAM_KEY], allowedTabs, defaultTab]
  );
  const initialTab = useMemo(() => {
    const fromUrl = readTabFromUrl(allowedTabs, defaultTab);
    return normalizeTab(routeTab || fromUrl || defaultTab, allowedTabs, defaultTab);
  }, [routeTab, allowedTabs, defaultTab]);

  const [activeTab, setActiveTabState] = useState(initialTab);

  useEffect(() => {
    if (routeTab && routeTab !== activeTab) {
      setActiveTabState(routeTab);
    }
  }, [routeTab, activeTab]);

  useEffect(() => {
    if (allowedTabs.includes(activeTab)) return;
    setActiveTabState(defaultTab);
    navigation?.setParams?.({ [TAB_PARAM_KEY]: defaultTab });
  }, [activeTab, allowedTabs, defaultTab, navigation]);

  useEffect(() => {
    if (route?.params?.[TAB_PARAM_KEY] !== activeTab) {
      navigation?.setParams?.({ [TAB_PARAM_KEY]: activeTab });
    }
  }, [navigation, route?.params, activeTab]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onPopState = () => {
      const fromUrl = readTabFromUrl(allowedTabs, defaultTab) || defaultTab;
      setActiveTabState(fromUrl);
      navigation?.setParams?.({ [TAB_PARAM_KEY]: fromUrl });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation, allowedTabs, defaultTab]);

  const setActiveTab = useCallback((nextTab, { pushHistory = true } = {}) => {
    const normalized = normalizeTab(nextTab, allowedTabs, defaultTab);
    setActiveTabState(normalized);
    navigation?.setParams?.({ [TAB_PARAM_KEY]: normalized });
    if (Platform.OS === 'web') {
      writeTabToUrl(normalized, pushHistory ? 'push' : 'replace');
    }
  }, [navigation, allowedTabs, defaultTab]);

  return {
    activeTab,
    setActiveTab,
  };
}
