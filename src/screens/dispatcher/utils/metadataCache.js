import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'dispatcher_cache_v1';

export const METADATA_KEYS = {
  SERVICE_TYPES: `${PREFIX}:service_types`,
  DISTRICTS: `${PREFIX}:districts`,
  PLATFORM_SETTINGS: `${PREFIX}:platform_settings`,
  DISPATCHERS: `${PREFIX}:dispatchers`,
  MASTERS: `${PREFIX}:masters`,
};

export const METADATA_TTL_MS = {
  SERVICE_TYPES: 30 * 60 * 1000,
  DISTRICTS: 30 * 60 * 1000,
  PLATFORM_SETTINGS: 10 * 60 * 1000,
  DISPATCHERS: 10 * 60 * 1000,
  MASTERS: 5 * 60 * 1000,
};

export async function getCachedMetadata(key, ttlMs) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.timestamp || (Date.now() - parsed.timestamp) > ttlMs) return null;
    return parsed.data ?? null;
  } catch (error) {
    return null;
  }
}

export async function setCachedMetadata(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (error) {
    // no-op: cache failures must never block UI
  }
}

