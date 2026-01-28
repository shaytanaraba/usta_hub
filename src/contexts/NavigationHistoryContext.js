import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import { useNavigationContainerRef } from '@react-navigation/native';

const NavigationHistoryContext = createContext(null);

const initialState = { entries: [], index: -1 };

const serializeParams = (params) => {
  if (!params) return '';
  try {
    return JSON.stringify(params);
  } catch (error) {
    return '';
  }
};

const isSameEntry = (a, b) => {
  if (!a || !b) return false;
  return a.name === b.name && serializeParams(a.params) === serializeParams(b.params);
};

function reducer(state, action) {
  switch (action.type) {
    case 'PUSH_ROUTE': {
      const entry = action.payload;
      const trimmed = state.entries.slice(0, state.index + 1);
      const last = trimmed[trimmed.length - 1];
      if (isSameEntry(last, entry)) return state;
      const entries = [...trimmed, entry];
      return { entries, index: entries.length - 1 };
    }
    case 'SET_INDEX': {
      const nextIndex = action.payload;
      if (nextIndex < 0 || nextIndex >= state.entries.length) return state;
      return { ...state, index: nextIndex };
    }
    case 'RESET': {
      const entry = action.payload;
      return { entries: entry ? [entry] : [], index: entry ? 0 : -1 };
    }
    default:
      return state;
  }
}

export function NavigationHistoryProvider({ children }) {
  const navRef = useNavigationContainerRef();
  const [state, dispatch] = useReducer(reducer, initialState);
  const ignoreNextRef = useRef(false);

  const onStateChange = useCallback(() => {
    if (!navRef.isReady()) return;
    if (ignoreNextRef.current) {
      ignoreNextRef.current = false;
      return;
    }
    const route = navRef.getCurrentRoute();
    if (!route) return;
    dispatch({ type: 'PUSH_ROUTE', payload: { name: route.name, params: route.params || null } });
  }, [navRef]);

  const goBack = useCallback(() => {
    if (!navRef.isReady()) return;
    if (state.index <= 0) return;
    const target = state.entries[state.index - 1];
    if (!target) return;
    ignoreNextRef.current = true;
    dispatch({ type: 'SET_INDEX', payload: state.index - 1 });
    navRef.navigate(target.name, target.params);
  }, [navRef, state.entries, state.index]);

  const goForward = useCallback(() => {
    if (!navRef.isReady()) return;
    if (state.index < 0 || state.index >= state.entries.length - 1) return;
    const target = state.entries[state.index + 1];
    if (!target) return;
    ignoreNextRef.current = true;
    dispatch({ type: 'SET_INDEX', payload: state.index + 1 });
    navRef.navigate(target.name, target.params);
  }, [navRef, state.entries, state.index]);

  const resetHistory = useCallback((entry) => {
    ignoreNextRef.current = true;
    dispatch({ type: 'RESET', payload: entry });
  }, []);

  const value = useMemo(() => ({
    navRef,
    onStateChange,
    canGoBack: state.index > 0,
    canGoForward: state.index >= 0 && state.index < state.entries.length - 1,
    goBack,
    goForward,
    resetHistory,
  }), [goBack, goForward, navRef, onStateChange, resetHistory, state.entries.length, state.index]);

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavHistory() {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    throw new Error('useNavHistory must be used within NavigationHistoryProvider');
  }
  return context;
}
