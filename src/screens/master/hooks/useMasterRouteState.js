import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ACCOUNT_VIEWS, MASTER_TABS, ORDER_SECTIONS } from '../constants/domain';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

const ALLOWED_TABS = new Set(Object.values(MASTER_TABS));
const ALLOWED_SECTIONS = new Set(Object.values(ORDER_SECTIONS));
const ALLOWED_ACCOUNT_VIEWS = new Set(Object.values(ACCOUNT_VIEWS));

const DEFAULT_STATE = {
  activeTab: MASTER_TABS.ORDERS,
  orderSection: ORDER_SECTIONS.AVAILABLE,
  accountView: ACCOUNT_VIEWS.MENU,
};

const sanitizeState = (raw) => {
  let activeTab = ALLOWED_TABS.has(raw?.activeTab) ? raw.activeTab : DEFAULT_STATE.activeTab;
  const orderSection = ALLOWED_SECTIONS.has(raw?.orderSection) ? raw.orderSection : DEFAULT_STATE.orderSection;
  const accountView = ALLOWED_ACCOUNT_VIEWS.has(raw?.accountView) ? raw.accountView : DEFAULT_STATE.accountView;

  // Any explicit account sub-view belongs to the Account tab.
  if (accountView !== ACCOUNT_VIEWS.MENU) {
    activeTab = MASTER_TABS.ACCOUNT;
  }

  return { activeTab, orderSection, accountView };
};

const parseStateFromSearch = (search) => {
  const params = new URLSearchParams(search || '');
  return sanitizeState({
    activeTab: params.get('tab') || DEFAULT_STATE.activeTab,
    orderSection: params.get('section') || DEFAULT_STATE.orderSection,
    accountView: params.get('account') || DEFAULT_STATE.accountView,
  });
};

const buildSearchFromState = (state) => {
  const params = new URLSearchParams();
  if (state.activeTab !== DEFAULT_STATE.activeTab) params.set('tab', state.activeTab);
  if (state.orderSection !== DEFAULT_STATE.orderSection) params.set('section', state.orderSection);
  if (state.accountView !== DEFAULT_STATE.accountView) params.set('account', state.accountView);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const useMasterRouteState = () => {
  const initial = isWeb ? parseStateFromSearch(window.location.search) : DEFAULT_STATE;

  const [activeTab, setActiveTabState] = useState(initial.activeTab);
  const [orderSection, setOrderSectionState] = useState(initial.orderSection);
  const [accountView, setAccountViewState] = useState(initial.accountView);

  const initializedRef = useRef(false);
  const lastSerializedRef = useRef('');

  const serializedState = useMemo(
    () => JSON.stringify({ activeTab, orderSection, accountView }),
    [activeTab, orderSection, accountView],
  );

  const applyLocationState = useCallback(() => {
    if (!isWeb) return;
    const parsed = parseStateFromSearch(window.location.search);
    setActiveTabState(parsed.activeTab);
    setOrderSectionState(parsed.orderSection);
    setAccountViewState(parsed.accountView);
    lastSerializedRef.current = JSON.stringify(parsed);
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    applyLocationState();
    initializedRef.current = true;

    const onPopState = () => {
      applyLocationState();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyLocationState]);

  useEffect(() => {
    if (!isWeb || !initializedRef.current) return;
    if (serializedState === lastSerializedRef.current) return;
    const nextState = JSON.parse(serializedState);
    const search = buildSearchFromState(nextState);
    const nextUrl = `${window.location.pathname}${search}${window.location.hash || ''}`;
    window.history.pushState({ masterRoute: nextState }, '', nextUrl);
    lastSerializedRef.current = serializedState;
  }, [serializedState]);

  const setActiveTab = useCallback((value) => {
    if (!ALLOWED_TABS.has(value)) return;
    setActiveTabState(value);
    if (value !== MASTER_TABS.ACCOUNT) {
      // Keep account state deterministic when user leaves account tab.
      setAccountViewState(ACCOUNT_VIEWS.MENU);
    }
  }, []);

  const setOrderSection = useCallback((value) => {
    if (!ALLOWED_SECTIONS.has(value)) return;
    setOrderSectionState(value);
  }, []);

  const setAccountView = useCallback((value) => {
    if (!ALLOWED_ACCOUNT_VIEWS.has(value)) return;
    // Opening/changing account sub-pages should never switch user to Orders.
    setActiveTabState(MASTER_TABS.ACCOUNT);
    setAccountViewState(value);
  }, []);

  return {
    activeTab,
    setActiveTab,
    orderSection,
    setOrderSection,
    accountView,
    setAccountView,
  };
};
