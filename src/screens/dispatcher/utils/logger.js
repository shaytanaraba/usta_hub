const DEBUG_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_PERF_LOGS === '1';
const INFO_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_DISPATCHER_LOGS === '1' || DEBUG_ENABLED;
const PREFIX = '[Dispatcher]';

const fmt = (scope) => `${PREFIX}[${scope}]`;

export function dispatcherDebug(scope, message, payload) {
  if (!DEBUG_ENABLED) return;
  if (payload === undefined) {
    console.log(fmt(scope), message);
    return;
  }
  console.log(fmt(scope), message, payload);
}

export function dispatcherInfo(scope, message, payload) {
  if (!INFO_ENABLED) return;
  if (payload === undefined) {
    console.log(fmt(scope), message);
    return;
  }
  console.log(fmt(scope), message, payload);
}

export function dispatcherWarn(scope, message, payload) {
  if (payload === undefined) {
    console.warn(fmt(scope), message);
    return;
  }
  console.warn(fmt(scope), message, payload);
}

export function dispatcherError(scope, message, payload) {
  if (payload === undefined) {
    console.error(fmt(scope), message);
    return;
  }
  console.error(fmt(scope), message, payload);
}

export const dispatcherLoggerConfig = {
  debugEnabled: DEBUG_ENABLED,
  infoEnabled: INFO_ENABLED,
};
