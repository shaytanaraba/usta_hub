import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useNavHistory } from '../../../contexts/NavigationHistoryContext';
import { normalizeAdminTab } from '../config/constants';

const TAB_PARAM_KEY = 'tab';
const TAB_QUERY_KEY = 'atab';
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

const readTabFromUrl = () => {
  if (!isWeb) return null;
  try {
    const params = new URLSearchParams(window.location.search || '');
    const raw = params.get(TAB_QUERY_KEY);
    return raw ? normalizeAdminTab(raw) : null;
  } catch (error) {
    return null;
  }
};

const writeTabToUrl = (tab, mode = 'push') => {
  if (!isWeb) return;
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
    // Ignore malformed URL edge cases.
  }
};

export default function useAdminTabRouting({ navigation, routeParams }) {
  const { pushRoute } = useNavHistory();
  const initialTab = useMemo(() => {
    const fromRoute = normalizeAdminTab(routeParams?.[TAB_PARAM_KEY]);
    if (routeParams?.[TAB_PARAM_KEY]) return fromRoute;
    return normalizeAdminTab(readTabFromUrl() || fromRoute);
  }, [routeParams?.[TAB_PARAM_KEY]]);
  const [activeTab, setActiveTabState] = useState(initialTab);

  useEffect(() => {
    if (!routeParams || typeof routeParams[TAB_PARAM_KEY] !== 'string') return;
    const fromRoute = normalizeAdminTab(routeParams?.[TAB_PARAM_KEY]);
    setActiveTabState((prev) => (prev === fromRoute ? prev : fromRoute));
  }, [routeParams?.[TAB_PARAM_KEY]]);

  useEffect(() => {
    const routeTab = normalizeAdminTab(routeParams?.[TAB_PARAM_KEY]);
    if (routeTab === activeTab) return;
    if (!navigation?.setParams) return;
    navigation.setParams({ ...(routeParams || {}), [TAB_PARAM_KEY]: activeTab });
  }, [activeTab, navigation, routeParams, routeParams?.[TAB_PARAM_KEY]]);

  useEffect(() => {
    if (!isWeb) return undefined;
    writeTabToUrl(activeTab, 'replace');

    const onPopState = () => {
      const fromUrl = normalizeAdminTab(readTabFromUrl() || initialTab);
      setActiveTabState((prev) => (prev === fromUrl ? prev : fromUrl));
      navigation?.setParams?.({ ...(routeParams || {}), [TAB_PARAM_KEY]: fromUrl });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeTab, initialTab, navigation, routeParams]);

  const setActiveTab = useCallback((nextTab) => {
    const normalized = normalizeAdminTab(nextTab);
    setActiveTabState((prev) => (prev === normalized ? prev : normalized));

    const nextParams = { ...(routeParams || {}), [TAB_PARAM_KEY]: normalized };
    if (isWeb) {
      writeTabToUrl(normalized, 'push');
      navigation?.setParams?.(nextParams);
      return;
    }
    if (typeof pushRoute === 'function') {
      pushRoute('AdminDashboard', nextParams);
      return;
    }
    if (navigation?.setParams) {
      navigation.setParams(nextParams);
    }
  }, [navigation, routeParams, pushRoute]);

  return { activeTab, setActiveTab };
}
