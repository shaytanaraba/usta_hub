import { useCallback, useEffect, useState } from 'react';
import { useNavHistory } from '../../../contexts/NavigationHistoryContext';
import { normalizeAdminTab } from '../config/constants';

export default function useAdminTabRouting({ navigation, routeParams }) {
  const { pushRoute } = useNavHistory();
  const [activeTab, setActiveTabState] = useState(() => normalizeAdminTab(routeParams?.tab));

  useEffect(() => {
    const fromRoute = normalizeAdminTab(routeParams?.tab);
    setActiveTabState((prev) => (prev === fromRoute ? prev : fromRoute));
  }, [routeParams?.tab]);

  useEffect(() => {
    const routeTab = normalizeAdminTab(routeParams?.tab);
    if (routeTab === activeTab) return;
    if (!navigation?.setParams) return;
    navigation.setParams({ ...(routeParams || {}), tab: activeTab });
  }, [activeTab, navigation, routeParams, routeParams?.tab]);

  const setActiveTab = useCallback((nextTab) => {
    const normalized = normalizeAdminTab(nextTab);
    setActiveTabState((prev) => (prev === normalized ? prev : normalized));

    const nextParams = { ...(routeParams || {}), tab: normalized };
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
