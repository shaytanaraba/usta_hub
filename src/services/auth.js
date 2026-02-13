/**
 * Auth Service - v5 Schema
 * Handles authentication with role-based access (admin/dispatcher/partner/master/client)
 */

import { supabase } from '../lib/supabase';
import { normalizeKyrgyzPhone } from '../utils/phone';

const LOG_PREFIX = '[AuthService]';
const isDebug = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_LOGS === '1';
const AUTH_SESSION_POLICY = process?.env?.EXPO_PUBLIC_AUTH_SESSION_POLICY === 'single' ? 'single' : 'multi';
const AUTH_DIAG_ENABLED = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS === '1';
const PROFILE_LIST_CACHE_TTL_MS = Number(process?.env?.EXPO_PUBLIC_PROFILE_LIST_CACHE_TTL_MS || 12000);
const debug = (...args) => {
  if (isDebug) console.log(...args);
};
const debugWarn = (...args) => {
  if (isDebug) console.warn(...args);
};
const authDiag = (...args) => {
  if (AUTH_DIAG_ENABLED) console.log('[AuthService][Diag]', ...args);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Profile columns used across auth + dashboards.
const PROFILE_SELECT_BASE_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'service_area',
  'specializations',
  'max_active_jobs',
  'max_immediate_orders',
  'max_pending_confirmation',
  'prepaid_balance',
  'initial_deposit',
  'completed_jobs_count',
  'created_at',
  'updated_at',
  'last_login_at'
];

// Added by partner patch (PATCH_PARTNER_ROLE_PAYOUTS.sql).
const PROFILE_SELECT_PARTNER_FIELDS = [
  'partner_balance',
  'partner_commission_rate',
  'partner_min_payout',
  'partner_company_id'
];

const PROFILE_SELECT_FIELDS = [
  ...PROFILE_SELECT_BASE_FIELDS,
  ...PROFILE_SELECT_PARTNER_FIELDS,
].join(', ');

const PROFILE_SELECT_FIELDS_LEGACY = PROFILE_SELECT_BASE_FIELDS.join(', ');
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MASTER_LIST_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'service_area',
  'specializations',
  'max_active_jobs',
  'prepaid_balance',
  'initial_deposit',
  'completed_jobs_count',
  'created_at',
  'updated_at',
  'last_login_at'
].join(', ');

const DISPATCHER_LIST_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'created_at',
  'updated_at',
  'last_login_at'
].join(', ');

const PARTNER_LIST_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'partner_balance',
  'partner_commission_rate',
  'partner_min_payout',
  'partner_company_id',
  'created_at',
  'updated_at',
  'last_login_at'
].join(', ');

const isLegacyProfileSchemaError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  if (code === '42703' && message.includes('profiles.partner_')) return true;
  return message.includes('column profiles.partner_balance does not exist')
    || message.includes('column profiles.partner_commission_rate does not exist')
    || message.includes('column profiles.partner_min_payout does not exist')
    || message.includes('column profiles.partner_company_id does not exist');
};

const normalizeProfileShape = (profile) => ({
  ...profile,
  partner_balance: Number(profile?.partner_balance || 0),
  partner_commission_rate: Number(profile?.partner_commission_rate || 0),
  partner_min_payout: Number(profile?.partner_min_payout || 50),
  partner_company_id: profile?.partner_company_id || null,
});

const isAuthInvalidError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  const status = error?.status;
  return status === 401
    || message.includes('jwt expired')
    || message.includes('invalid jwt')
    || message.includes('invalid token')
    || message.includes('auth session missing')
    || message.includes('token has expired')
    || message.includes('refresh token');
};

const isTransientError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  return error?.code === 'SUPABASE_TIMEOUT'
    || error?.name === 'SupabaseTimeoutError'
    || message.includes('request timed out')
    || message.includes('the operation was aborted')
    || message.includes('aborterror')
    || message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('econnreset')
    || message.includes('eai_again');
};

const normalizePeopleSearch = (value) => String(value || '')
  .trim()
  .replace(/[,%]/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 80);

const buildPeopleSearchOrFilter = (term) => {
  const safe = normalizePeopleSearch(term);
  if (!safe) return null;
  return `full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`;
};

const mapLoginError = (error) => {
  const raw = String(error?.message || '').trim();
  const message = raw.toLowerCase();

  if (raw === 'Email and password are required') {
    return { code: 'MISSING_CREDENTIALS', message: raw };
  }

  if (raw === 'Invalid login credentials' || message.includes('invalid login credentials')) {
    return { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' };
  }

  if (isAuthInvalidError(error)) {
    return { code: 'SESSION_EXPIRED', message: 'Your session expired. Please sign in again.' };
  }

  if (isTransientError(error)) {
    if (error?.code === 'SUPABASE_TIMEOUT' || error?.name === 'SupabaseTimeoutError' || message.includes('request timed out')) {
      return { code: 'REQUEST_TIMEOUT', message: 'Request timed out. Please check your connection and retry.' };
    }
    return { code: 'NETWORK_ERROR', message: 'Network error. Please try again.' };
  }

  if (raw) {
    return { code: 'UNKNOWN', message: raw };
  }

  return { code: 'UNKNOWN', message: 'An unexpected error occurred' };
};

class AuthService {
  constructor() {
    this.redirects = {
      admin: 'AdminDashboard',
      dispatcher: 'DispatcherDashboard',
      partner: 'PartnerDashboard',
      master: 'MasterDashboard',
      client: null, // Clients cannot login in v5 (dispatcher-mediated)
    };
    this.authSessionPolicy = AUTH_SESSION_POLICY;
    this.profileListCache = new Map();
    this.profileListInflight = new Map();
    this.profileListCacheTtlMs = Number.isFinite(PROFILE_LIST_CACHE_TTL_MS) && PROFILE_LIST_CACHE_TTL_MS >= 0
      ? PROFILE_LIST_CACHE_TTL_MS
      : 12000;
    authDiag('policy_initialized', { authSessionPolicy: this.authSessionPolicy });
  }

  resolveSignOutScope(options = {}) {
    if (options.scope) return options.scope;
    return this.authSessionPolicy === 'single' ? 'global' : 'local';
  }

  invalidateProfileListCache() {
    this.profileListCache.clear();
    this.profileListInflight.clear();
    authDiag('profile_list_cache_invalidated');
  }

  normalizeProfileListOptions(options = {}) {
    return {
      page: Number.isInteger(options.page) && options.page >= 0 ? options.page : null,
      pageSize: Number.isInteger(options.pageSize) && options.pageSize > 0 ? options.pageSize : null,
      force: options.force === true,
      search: normalizePeopleSearch(options.search || options.query || ''),
    };
  }

  buildProfileListCacheKey(role, options = {}) {
    const opts = this.normalizeProfileListOptions(options);
    return JSON.stringify({
      role,
      page: opts.page,
      pageSize: opts.pageSize,
      search: opts.search,
    });
  }

  async runProfileListQuery(role, selectFields, options = {}) {
    const opts = this.normalizeProfileListOptions(options);
    debug(`${LOG_PREFIX} Fetching ${role} list...`);
    let query = supabase
      .from('profiles')
      .select(selectFields)
      .eq('role', role);

    if (opts.search) {
      const orFilter = buildPeopleSearchOrFilter(opts.search);
      if (orFilter) {
        query = query.or(orFilter);
      }
      query = query.order('full_name', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (opts.page !== null && opts.pageSize !== null) {
      const start = opts.page * opts.pageSize;
      const end = start + opts.pageSize - 1;
      query = query.range(start, end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async fetchProfileListWithCache(role, selectFields, options = {}) {
    const opts = this.normalizeProfileListOptions(options);
    const cacheKey = this.buildProfileListCacheKey(role, opts);
    const now = Date.now();

    if (!opts.force) {
      const cached = this.profileListCache.get(cacheKey);
      if (cached && (now - cached.ts) < this.profileListCacheTtlMs) {
        authDiag('profile_list_cache_hit', { role, cacheKey, ageMs: now - cached.ts });
        return cached.data;
      }
      const inFlight = this.profileListInflight.get(cacheKey);
      if (inFlight) {
        authDiag('profile_list_inflight_join', { role, cacheKey });
        return inFlight;
      }
    }

    authDiag('profile_list_cache_miss', { role, cacheKey, force: opts.force });
    const task = (async () => {
      const data = await this.runProfileListQuery(role, selectFields, opts);
      this.profileListCache.set(cacheKey, { ts: Date.now(), data });
      return data;
    })();
    this.profileListInflight.set(cacheKey, task);
    try {
      return await task;
    } finally {
      if (this.profileListInflight.get(cacheKey) === task) {
        this.profileListInflight.delete(cacheKey);
      }
    }
  }

  async enforceSessionPolicyOnLogin() {
    if (this.authSessionPolicy !== 'single') return;
    try {
      // Revoke other sessions while keeping current one for single-session policy.
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        console.warn(`${LOG_PREFIX} single-session policy: failed to revoke other sessions`, error?.message || error);
        return;
      }
      authDiag('single_session_policy_applied', { revoked: 'others' });
    } catch (error) {
      console.warn(`${LOG_PREFIX} single-session policy enforcement failed`, error?.message || error);
    }
  }

  async fetchProfileById(userId, options = {}) {
    const retries = Number.isInteger(options.retries) ? options.retries : 0;
    const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 300;
    let attempt = 0;
    let useLegacySelect = false;
    let lastError = null;

    while (attempt <= retries) {
      const selectFields = useLegacySelect ? PROFILE_SELECT_FIELDS_LEGACY : PROFILE_SELECT_FIELDS;
      const { data, error } = await supabase
        .from('profiles')
        .select(selectFields)
        .eq('id', userId)
        .single();

      if (!error && data) {
        return { profile: normalizeProfileShape(data), error: null };
      }

      lastError = error || null;

      // Backward compatibility: allow login before partner DB patch is applied.
      if (!useLegacySelect && isLegacyProfileSchemaError(error)) {
        authDiag('profile_select_legacy_fallback', { userId });
        useLegacySelect = true;
        continue;
      }

      if (attempt < retries && isTransientError(error)) {
        attempt += 1;
        await sleep(retryDelayMs * attempt);
        continue;
      }

      break;
    }

    return { profile: null, error: lastError };
  }

  /**
   * Login user - v5 uses 'role' field instead of 'user_type'
   */
  async loginUser(email, password) {
    debug(`${LOG_PREFIX} Attempting login for: ${email}`);
    authDiag('login_attempt', { authSessionPolicy: this.authSessionPolicy });

    try {
      if (!email?.trim() || !password) {
        throw new Error('Email and password are required');
      }

      const maxAttempts = 2;
      let data = null;
      let error = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        data = result?.data || null;
        error = result?.error || null;
        if (!error || !isTransientError(error) || attempt === maxAttempts) {
          break;
        }
        await sleep(250 * attempt);
      }

      if (error) {
        console.error(`${LOG_PREFIX} Auth error:`, error.message);
        throw error;
      }

      if (!data?.user?.id) {
        await this.logoutUser({ scope: 'local' });
        throw new Error('Login succeeded but user session was not returned');
      }

      debug(`${LOG_PREFIX} Auth successful, fetching profile...`);

      const { profile, error: profileError } = await this.fetchProfileById(data.user.id, {
        retries: 1,
        retryDelayMs: 250,
      });

      if (profileError || !profile) {
        console.error(`${LOG_PREFIX} Profile error:`, profileError?.message);
        if (profileError && isTransientError(profileError)) {
          await this.logoutUser({ scope: 'local' });
          throw profileError;
        }
        await this.logoutUser({ scope: 'local' });
        throw new Error('User profile not found');
      }

      // Check if user is active
      if (!profile.is_active) {
        debugWarn(`${LOG_PREFIX} User deactivated:`, profile.id);
        await this.logoutUser();
        throw new Error('Account deactivated. Contact administrator.');
      }

      // Dispatcher/partner access is controlled by verification status.
      if (['dispatcher', 'partner'].includes(profile.role) && profile.is_verified !== true) {
        debugWarn(`${LOG_PREFIX} ${profile.role} access disabled (not verified):`, profile.id);
        await this.logoutUser({ scope: 'local' });
        throw new Error(`${profile.role === 'partner' ? 'Partner' : 'Dispatcher'} account is unverified. Contact administrator.`);
      }

      // Block client logins in v5 (dispatcher-mediated architecture)
      if (profile.role === 'client') {
        debugWarn(`${LOG_PREFIX} Client login blocked:`, profile.id);
        await this.logoutUser();
        throw new Error('Client accounts cannot login. Contact dispatcher for service.');
      }

      const redirectScreen = this.redirects[profile.role];
      if (!redirectScreen) {
        console.error(`${LOG_PREFIX} No redirect screen for role:`, profile.role);
        await this.logoutUser();
        throw new Error('Invalid user role. Contact administrator.');
      }

      debug(`${LOG_PREFIX} Login successful. Role: ${profile.role}`);
      await this.enforceSessionPolicyOnLogin();
      this.invalidateProfileListCache();

      return {
        success: true,
        message: 'Login successful',
        user: { ...data.user, ...profile },
        redirectScreen,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Login failed:`, error.message);
      const mapped = mapLoginError(error);
      return { success: false, message: mapped.message, code: mapped.code };
    }
  }

  /**
   * Get current logged-in user with full profile
   */
  async getCurrentUser(options = {}) {
    debug(`${LOG_PREFIX} Getting current user...`);

    try {
      let session = options.session || null;
      if (!session) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error(`${LOG_PREFIX} Session fetch error:`, sessionError?.message);
          if (isAuthInvalidError(sessionError)) {
            await supabase.auth.signOut({ scope: 'local' });
          }
          return null;
        }
        session = data?.session || null;
      }

      if (!session) {
        debug(`${LOG_PREFIX} No active session`);
        return null;
      }

      const retries = Number.isInteger(options.retries) ? options.retries : 0;
      const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 300;
      const { profile, error } = await this.fetchProfileById(session.user.id, { retries, retryDelayMs });

      if (!error && profile) {
        if (profile.is_active === false) {
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        if (['dispatcher', 'partner'].includes(profile.role) && profile.is_verified !== true) {
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        if (profile.role === 'client') {
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        debug(`${LOG_PREFIX} Current user: ${profile.full_name} (${profile.role})`);
        return { ...session.user, ...profile };
      }

      if (error) {
        console.error(`${LOG_PREFIX} Profile fetch error:`, error?.message);
        const errorCode = String(error?.code || '');
        const lowered = String(error?.message || '').toLowerCase();
        const missingProfile = errorCode === 'PGRST116'
          || lowered.includes('multiple (or no) rows returned')
          || lowered.includes('0 rows');
        if (missingProfile) {
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        if (isAuthInvalidError(error)) {
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error(`${LOG_PREFIX} getCurrentUser error:`, error);
      return null;
    }
  }

  /**
   * Logout user
   */
  async logoutUser(options = {}) {
    debug(`${LOG_PREFIX} Logging out...`);
    this.invalidateProfileListCache();

    try {
      const scope = this.resolveSignOutScope(options);
      authDiag('logout_scope_resolved', { scope, authSessionPolicy: this.authSessionPolicy });
      const { error } = await supabase.auth.signOut({ scope });
      if (error) throw error;
      debug(`${LOG_PREFIX} Logout successful`);
      return { success: true };
    } catch (error) {
      console.error(`${LOG_PREFIX} Logout error:`, error);
      if (options.scope && options.scope !== 'local') {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch (localError) {
          console.error(`${LOG_PREFIX} Logout local fallback error:`, localError);
        }
      }
      this.invalidateProfileListCache();
      return { success: false, message: error.message };
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  }

  /**
   * Get dashboard screen for role
   */
  getDashboardScreen(role) {
    return this.redirects[role] || 'Login';
  }

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================

  /**
   * Get all masters (admin/dispatcher)
   */
  async getAllMasters(options = {}) {
    try {
      const data = await this.fetchProfileListWithCache('master', MASTER_LIST_FIELDS, options);
      debug(`${LOG_PREFIX} Found ${data.length} masters`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllMasters error:`, error);
      return [];
    }
  }

  /**
   * Get all dispatchers (admin)
   */
  async getAllDispatchers(options = {}) {
    try {
      const data = await this.fetchProfileListWithCache('dispatcher', DISPATCHER_LIST_FIELDS, options);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllDispatchers error:`, error);
      return [];
    }
  }

  /**
   * Get all admins (admin only)
   */
  async getAllAdmins(options = {}) {
    try {
      const data = await this.fetchProfileListWithCache('admin', DISPATCHER_LIST_FIELDS, options);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllAdmins error:`, error);
      return [];
    }
  }

  /**
   * Get all partners (admin)
   */
  async getAllPartners(options = {}) {
    try {
      const data = await this.fetchProfileListWithCache('partner', PARTNER_LIST_FIELDS, options);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllPartners error:`, error);
      return [];
    }
  }

  /**
   * Verify master (admin only)
   */
  async verifyMaster(masterId) {
    debug(`${LOG_PREFIX} Verifying master: ${masterId}`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', masterId)
        .eq('role', 'master')
        .select()
        .single();

      if (error) throw error;
      debug(`${LOG_PREFIX} Master verified successfully`);
      this.invalidateProfileListCache();
      return { success: true, message: 'Master verified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} verifyMaster error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unverify master (admin only)
   */
  async unverifyMaster(masterId) {
    debug(`${LOG_PREFIX} Unverifying master: ${masterId}`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_verified: false })
        .eq('id', masterId)
        .eq('role', 'master')
        .select()
        .single();

      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Master unverified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} unverifyMaster error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates) {
    debug(`${LOG_PREFIX} Updating profile: ${userId}`);

    try {
      const hasField = (fieldName) => Object.prototype.hasOwnProperty.call(updates || {}, fieldName);
      const profileUpdates = {};
      const parseNonNegativeInteger = (value, label, { allowNull = false } = {}) => {
        if (value === undefined) return { skip: true };
        const raw = String(value ?? '').trim();
        if (!raw) {
          if (allowNull) return { value: null };
          return { error: `${label} is required` };
        }
        if (!/^\d+$/.test(raw)) return { error: `${label} must be a non-negative whole number` };
        return { value: Number.parseInt(raw, 10) };
      };
      const parseNonNegativeDecimal = (value, label, { allowNull = false, precision = 2 } = {}) => {
        if (value === undefined) return { skip: true };
        const raw = String(value ?? '').trim();
        if (!raw) {
          if (allowNull) return { value: null };
          return { error: `${label} is required` };
        }
        const parsed = Number(raw.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) return { error: `${label} must be a non-negative number` };
        return { value: Number(parsed.toFixed(precision)) };
      };

      if (hasField('full_name') || hasField('name')) {
        const nextFullName = hasField('full_name') ? updates.full_name : updates.name;
        profileUpdates.full_name = String(nextFullName || '').trim();
      }

      if (hasField('phone')) {
        const rawPhone = String(updates.phone || '').trim();
        if (!rawPhone) {
          profileUpdates.phone = '';
        } else {
          const normalizedPhone = normalizeKyrgyzPhone(rawPhone);
          if (!normalizedPhone) {
            return { success: false, message: 'Phone must be a valid Kyrgyz number (+996XXXXXXXXX)' };
          }
          profileUpdates.phone = normalizedPhone;
        }
      }

      if (hasField('email')) {
        const normalizedEmail = String(updates.email || '').trim().toLowerCase();
        if (normalizedEmail && !EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
          return { success: false, message: 'Invalid email format' };
        }
        profileUpdates.email = normalizedEmail;
      }

      if (hasField('service_area')) {
        profileUpdates.service_area = String(updates.service_area || '').trim();
      }

      if (hasField('specializations')) {
        profileUpdates.specializations = updates.specializations;
      }

      if (hasField('max_active_jobs')) {
        const parsed = parseNonNegativeInteger(updates.max_active_jobs, 'Max active jobs', { allowNull: true });
        if (parsed.error) return { success: false, message: parsed.error };
        if (!parsed.skip) profileUpdates.max_active_jobs = parsed.value;
      }

      if (hasField('max_immediate_orders')) {
        const parsed = parseNonNegativeInteger(updates.max_immediate_orders, 'Max immediate orders', { allowNull: true });
        if (parsed.error) return { success: false, message: parsed.error };
        if (!parsed.skip) profileUpdates.max_immediate_orders = parsed.value;
      }

      if (hasField('max_pending_confirmation')) {
        const parsed = parseNonNegativeInteger(updates.max_pending_confirmation, 'Max pending confirmation', { allowNull: true });
        if (parsed.error) return { success: false, message: parsed.error };
        if (!parsed.skip) profileUpdates.max_pending_confirmation = parsed.value;
      }

      if (hasField('partner_commission_rate')) {
        const raw = String(updates.partner_commission_rate ?? '').trim();
        if (!raw) {
          profileUpdates.partner_commission_rate = null;
        } else {
          const parsed = Number(raw.replace(',', '.'));
          if (!Number.isFinite(parsed) || parsed < 0) {
            return { success: false, message: 'Partner commission rate must be between 0 and 100' };
          }
          const normalizedRate = parsed <= 1 ? parsed : parsed / 100;
          if (normalizedRate < 0 || normalizedRate > 1) {
            return { success: false, message: 'Partner commission rate must be between 0 and 100' };
          }
          profileUpdates.partner_commission_rate = Number(normalizedRate.toFixed(5));
        }
      }

      if (hasField('partner_min_payout')) {
        const parsed = parseNonNegativeDecimal(updates.partner_min_payout, 'Partner minimum payout', { allowNull: true, precision: 2 });
        if (parsed.error) return { success: false, message: parsed.error };
        if (!parsed.skip) profileUpdates.partner_min_payout = parsed.value;
      }

      if (!Object.keys(profileUpdates).length) {
        return { success: false, message: 'No valid profile fields to update' };
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Profile updated', user: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updateProfile error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Create new user (admin/dispatcher/partner) - Creates user in auth + profile
   * Admin can create master/dispatcher/partner.
   * Dispatcher/partner can create only master accounts (always unverified).
   */
  async createUser(userData, options = {}) {
    const requestedRole = String(userData?.role || '').trim().toLowerCase();
    debug(`${LOG_PREFIX} Creating new user: ${userData?.email} (${requestedRole || 'unknown'})`);

    let originalSessionTokens = null;
    let originalSessionUserId = null;
    let snapshotSucceeded = false;
    try {
      const { data: { session: originalSession } } = await supabase.auth.getSession();
      snapshotSucceeded = true;
      originalSessionUserId = originalSession?.user?.id || null;
      if (originalSession?.access_token && originalSession?.refresh_token) {
        originalSessionTokens = {
          access_token: originalSession.access_token,
          refresh_token: originalSession.refresh_token,
        };
      }
    } catch (sessionSnapshotError) {
      console.error(`${LOG_PREFIX} Failed to snapshot session before createUser:`, sessionSnapshotError);
    }

    const restoreOriginalSession = async () => {
      if (!originalSessionTokens) {
        if (!snapshotSucceeded) return;
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch (signOutError) {
          console.error(`${LOG_PREFIX} createUser local cleanup failed:`, signOutError);
        }
        return;
      }
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.user?.id && currentSession.user.id === originalSessionUserId) {
          return;
        }
      } catch (sessionReadError) {
        console.error(`${LOG_PREFIX} Failed to read current session during restore:`, sessionReadError);
      }
      const { error: restoreError } = await supabase.auth.setSession(originalSessionTokens);
      if (restoreError) {
        console.error(`${LOG_PREFIX} Failed to restore previous session after createUser:`, restoreError);
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch (signOutError) {
          console.error(`${LOG_PREFIX} createUser fallback signOut failed:`, signOutError);
        }
      }
    };

    let sessionRestored = false;
    try {
      if (!userData?.email || !userData?.password || !requestedRole) {
        throw new Error('Email, password, and role are required');
      }

      if (!['master', 'dispatcher', 'partner'].includes(requestedRole)) {
        throw new Error('Role must be master, dispatcher, or partner');
      }

      let creatorRole = String(options?.creatorRole || '').trim().toLowerCase();
      if (!creatorRole) {
        const currentProfile = await this.getCurrentUser({ retries: 1, retryDelayMs: 250 });
        creatorRole = String(currentProfile?.role || '').trim().toLowerCase();
      }

      if (!['admin', 'dispatcher', 'partner'].includes(creatorRole)) {
        throw new Error('Only admins, dispatchers, or partners can create users');
      }

      if ((creatorRole === 'dispatcher' || creatorRole === 'partner') && requestedRole !== 'master') {
        throw new Error('Dispatchers and partners can only create master accounts');
      }

      const normalizedEmail = String(userData.email || '').trim().toLowerCase();
      const normalizedFullName = String(userData.full_name || '').trim();
      const password = String(userData.password || '');
      const rawPhone = String(userData.phone || '').trim();
      const normalizedPhone = rawPhone ? normalizeKyrgyzPhone(rawPhone) : '';

      if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
        throw new Error('Invalid email format');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      if (rawPhone && !normalizedPhone) {
        throw new Error('Phone must be a valid Kyrgyz number (+996XXXXXXXXX)');
      }

      const normalizePartnerRateToRatio = (value) => {
        if (value === undefined || value === null || value === '') return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        if (parsed < 0) return null;
        if (parsed <= 1) return parsed;
        if (parsed <= 100) return parsed / 100;
        return null;
      };

      const parseNonNegativeNumber = (value) => {
        if (value === undefined || value === null || value === '') return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return null;
        return parsed;
      };

      const partnerCommissionRate = requestedRole === 'partner'
        ? normalizePartnerRateToRatio(userData.partner_commission_rate)
        : null;
      const partnerMinPayout = requestedRole === 'partner'
        ? parseNonNegativeNumber(userData.partner_min_payout)
        : null;
      const parseOptionalLimit = (value) => {
        if (value === undefined) return { provided: false, value: null, error: null };
        const raw = String(value ?? '').trim();
        if (!raw) return { provided: true, value: null, error: null };
        if (!/^\d+$/.test(raw)) return { provided: true, value: null, error: 'Master limits must be non-negative whole numbers' };
        return { provided: true, value: Number.parseInt(raw, 10), error: null };
      };
      const maxActiveJobs = parseOptionalLimit(userData.max_active_jobs);
      const maxImmediateOrders = parseOptionalLimit(userData.max_immediate_orders);
      const maxPendingConfirmation = parseOptionalLimit(userData.max_pending_confirmation);

      if (requestedRole === 'partner' && userData.partner_commission_rate !== undefined
        && userData.partner_commission_rate !== null && userData.partner_commission_rate !== ''
        && partnerCommissionRate === null) {
        throw new Error('Partner commission rate must be between 0 and 100');
      }

      if (requestedRole === 'partner' && userData.partner_min_payout !== undefined
        && userData.partner_min_payout !== null && userData.partner_min_payout !== ''
        && partnerMinPayout === null) {
        throw new Error('Partner minimum payout must be a non-negative number');
      }

      if (requestedRole === 'master' && (maxActiveJobs.error || maxImmediateOrders.error || maxPendingConfirmation.error)) {
        throw new Error(maxActiveJobs.error || maxImmediateOrders.error || maxPendingConfirmation.error);
      }

      // Create auth user via Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedFullName || '',
            phone: normalizedPhone || '',
            // Never trust role from client metadata; DB trigger forces initial "client".
            role: 'client',
          }
        }
      });

      if (authError) {
        console.error(`${LOG_PREFIX} Auth signup error:`, authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user');
      }

      // Restore admin session immediately after signup to avoid UI/session switching.
      await restoreOriginalSession();
      sessionRestored = true;

      const isStaffMasterProvision = requestedRole === 'master'
        && (creatorRole === 'dispatcher' || creatorRole === 'partner');
      const configureRpcName = isStaffMasterProvision
        ? 'staff_configure_master_profile'
        : 'admin_configure_user_profile';
      const configurePayload = isStaffMasterProvision
        ? {
          p_target_user_id: authData.user.id,
          p_full_name: normalizedFullName || null,
          p_phone: normalizedPhone || null,
          p_service_area: String(userData.service_area || '').trim() || null,
        }
        : {
          p_target_user_id: authData.user.id,
          p_role: requestedRole,
          p_full_name: normalizedFullName || null,
          p_phone: normalizedPhone || null,
          p_service_area: requestedRole === 'master' ? String(userData.service_area || '').trim() : null,
          p_partner_commission_rate: requestedRole === 'partner' ? partnerCommissionRate : null,
          p_partner_min_payout: requestedRole === 'partner' ? partnerMinPayout : null,
          p_mark_verified: requestedRole === 'dispatcher' || requestedRole === 'partner',
        };

      const { data: configureResult, error: configureError } = await supabase.rpc(configureRpcName, configurePayload);

      if (configureError) {
        console.error(`${LOG_PREFIX} ${configureRpcName} RPC error:`, configureError);
        const rpcCode = String(configureError?.code || '');
        const rpcMessage = String(configureError?.message || '').toLowerCase();
        if (rpcCode === '42883' || rpcMessage.includes(configureRpcName)) {
          if (configureRpcName === 'staff_configure_master_profile') {
            throw new Error('Database patch missing: apply PATCH_STAFF_MASTER_CREATE_AND_ADMIN_DELETE.sql');
          }
          throw new Error('Database patch missing: apply PATCH_ADMIN_PANEL_USER_PROVISIONING.sql');
        }
        throw configureError;
      }

      if (!configureResult?.success) {
        const message = configureResult?.message || 'User created but profile setup failed.';
        return {
          success: false,
          message,
          user: { id: authData.user.id, email: normalizedEmail, role: requestedRole },
        };
      }

      let profile = configureResult?.user || { id: authData.user.id, email: normalizedEmail, role: requestedRole };

      if (creatorRole === 'admin' && requestedRole === 'master') {
        const masterLimitUpdates = {};
        if (maxActiveJobs.provided) masterLimitUpdates.max_active_jobs = maxActiveJobs.value;
        if (maxImmediateOrders.provided) masterLimitUpdates.max_immediate_orders = maxImmediateOrders.value;
        if (maxPendingConfirmation.provided) masterLimitUpdates.max_pending_confirmation = maxPendingConfirmation.value;

        if (Object.keys(masterLimitUpdates).length) {
          const limitUpdateResult = await this.updateProfile(authData.user.id, masterLimitUpdates);
          if (!limitUpdateResult?.success) {
            return {
              success: false,
              message: limitUpdateResult?.message || 'User created but master limits update failed',
              user: profile,
            };
          }
          profile = limitUpdateResult.user || profile;
        }
      }

      debug(`${LOG_PREFIX} User created successfully: ${profile.full_name}`);
      this.invalidateProfileListCache();
      const roleTitleMap = {
        master: 'Master',
        dispatcher: 'Dispatcher',
        partner: 'Partner',
      };
      const defaultSuccessMessage = isStaffMasterProvision
        ? 'Master created. Waiting for admin verification'
        : `${roleTitleMap[requestedRole] || 'User'} created successfully`;
      return {
        success: true,
        message: configureResult?.message || defaultSuccessMessage,
        user: profile
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} createUser error:`, error);
      return { success: false, message: error.message };
    } finally {
      if (!sessionRestored) {
        await restoreOriginalSession();
      }
    }
  }

  /**
   * Verify dispatcher (admin only)
   */
  async verifyDispatcher(dispatcherId) {
    debug(`${LOG_PREFIX} Verifying dispatcher: ${dispatcherId}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true, is_active: true })
        .eq('id', dispatcherId)
        .eq('role', 'dispatcher');
      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Dispatcher verified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} verifyDispatcher error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unverify dispatcher (admin only)
   */
  async unverifyDispatcher(dispatcherId) {
    debug(`${LOG_PREFIX} Unverifying dispatcher: ${dispatcherId}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: false, is_active: false })
        .eq('id', dispatcherId)
        .eq('role', 'dispatcher');
      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Dispatcher unverified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} unverifyDispatcher error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Verify partner (admin only)
   */
  async verifyPartner(partnerId) {
    debug(`${LOG_PREFIX} Verifying partner: ${partnerId}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true, is_active: true })
        .eq('id', partnerId)
        .eq('role', 'partner');
      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Partner verified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} verifyPartner error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unverify partner (admin only)
   */
  async unverifyPartner(partnerId) {
    debug(`${LOG_PREFIX} Unverifying partner: ${partnerId}`);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: false, is_active: false })
        .eq('id', partnerId)
        .eq('role', 'partner');
      if (error) throw error;
      this.invalidateProfileListCache();
      return { success: true, message: 'Partner unverified' };
    } catch (error) {
      console.error(`${LOG_PREFIX} unverifyPartner error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reset user password (admin only) - Securely resets password for masters/dispatchers/partners
   * Uses admin_reset_user_password RPC function from PATCH_ADMIN_PASSWORD_RESET.sql
   */
  async resetUserPassword(userId, newPassword) {
    debug(`${LOG_PREFIX} Resetting password for user: ${userId}`);

    try {
      if (!newPassword || newPassword.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters' };
      }

      const { data, error } = await supabase.rpc('admin_reset_user_password', {
        p_target_user_id: userId,
        p_new_password: newPassword
      });

      if (error) {
        console.error(`${LOG_PREFIX} resetUserPassword RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        const errorMessages = {
          'USER_NOT_FOUND': 'User not found',
          'CANNOT_RESET_ADMIN_PASSWORD': 'Cannot reset admin passwords',
          'PASSWORD_TOO_SHORT': 'Password must be at least 6 characters'
        };
        return {
          success: false,
          message: errorMessages[data.error] || data.error || 'Password reset failed'
        };
      }

      debug(`${LOG_PREFIX} Password reset successful for ${data.target_role}`);
      return {
        success: true,
        message: 'Password reset successfully. User can now login with the new password.'
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} resetUserPassword failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Hard delete user (admin only)
   * Uses admin_hard_delete_user RPC to remove auth + profile with audit logging.
   */
  async hardDeleteUser(userId, reason = null) {
    debug(`${LOG_PREFIX} Hard deleting user: ${userId}`);

    try {
      if (!userId) {
        return { success: false, message: 'User id is required' };
      }

      const { data, error } = await supabase.rpc('admin_hard_delete_user', {
        p_target_user_id: userId,
        p_reason: reason || null,
      });

      if (error) {
        console.error(`${LOG_PREFIX} admin_hard_delete_user RPC error:`, error);
        const rpcCode = String(error?.code || '');
        const rpcMessage = String(error?.message || '').toLowerCase();
        if (rpcCode === '42883' || rpcMessage.includes('admin_hard_delete_user')) {
          throw new Error('Database patch missing: apply PATCH_STAFF_MASTER_CREATE_AND_ADMIN_DELETE.sql');
        }
        throw error;
      }

      if (!data?.success) {
        return {
          success: false,
          message: data?.message || data?.error || 'Failed to delete user',
          error: data?.error || null,
          blockers: data?.blockers || null,
        };
      }

      this.invalidateProfileListCache();
      return {
        success: true,
        message: data?.message || 'User deleted successfully',
        deletedRole: data?.deleted_role || null,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} hardDeleteUser error:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // STAFF MANAGEMENT FUNCTIONS
  // ============================================

  /**
   * Get all dispatchers with workload data (admin only)
   */
  async getDispatchersWithWorkload() {
    debug(`${LOG_PREFIX} Fetching dispatchers with workload...`);

    try {
      const { data, error } = await supabase.rpc('get_dispatchers_with_workload');

      if (error) {
        console.error(`${LOG_PREFIX} RPC error, falling back to direct query:`, error);
        // Fallback to direct query if RPC not available
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'dispatcher')
          .order('is_active', { ascending: false })
          .order('full_name', { ascending: true });

        if (fallbackError) throw fallbackError;

        // Manually add placeholder workload (will be 0 until RPC is deployed)
        return fallbackData.map(d => ({
          ...d,
          active_order_count: 0,
          total_order_count: 0
        }));
      }

      debug(`${LOG_PREFIX} Found ${data.length} dispatchers`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getDispatchersWithWorkload error:`, error);
      return [];
    }
  }

  /**
   * Toggle dispatcher active status (admin only)
   */
  async toggleDispatcherActive(dispatcherId, newStatus, reason = null) {
    debug(`${LOG_PREFIX} Toggling dispatcher ${dispatcherId} to ${newStatus ? 'active' : 'inactive'}`);

    try {
      const { data, error } = await supabase.rpc('toggle_dispatcher_active', {
        target_dispatcher_id: dispatcherId,
        new_status: newStatus,
        reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} RPC error:`, error);
        throw error;
      }

      if (data.success === false) {
        // Handle validation errors from the function
        return {
          success: false,
          message: data.message,
          errorCode: data.error,
          activeOrders: data.active_orders
        };
      }

      debug(`${LOG_PREFIX} Dispatcher status updated:`, data);
      this.invalidateProfileListCache();
      return {
        success: true,
        message: `${data.dispatcher_name} ${newStatus ? 'activated' : 'deactivated'}`,
        data
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} toggleDispatcherActive error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reassign all active orders from one dispatcher to another (admin only)
   */
  async reassignDispatcherOrders(oldDispatcherId, newDispatcherId, reason = 'Staff reassignment') {
    debug(`${LOG_PREFIX} Reassigning orders from ${oldDispatcherId} to ${newDispatcherId}`);

    try {
      const { data, error } = await supabase.rpc('reassign_dispatcher_orders', {
        old_dispatcher_id: oldDispatcherId,
        new_dispatcher_id: newDispatcherId,
        reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} RPC error:`, error);
        throw error;
      }

      debug(`${LOG_PREFIX} Orders reassigned:`, data);
      return {
        success: true,
        message: `${data.orders_reassigned} orders reassigned successfully`,
        ordersReassigned: data.orders_reassigned
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} reassignDispatcherOrders error:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // ADMIN METRICS FUNCTIONS (Missing DB Wrappers)
  // ============================================

  /**
   * Get master active workload (admin) - Returns active job counts for masters
   * Uses get_master_active_workload RPC function from COMPLETE_SETUP_V2.sql
   */
  async getMasterWorkload(masterId = null) {
    debug(`${LOG_PREFIX} Fetching master workload...`);

    try {
      const { data, error } = await supabase.rpc('get_master_active_workload', {
        p_master_id: masterId
      });

      if (error) {
        console.error(`${LOG_PREFIX} getMasterWorkload RPC error:`, error);
        throw error;
      }

      debug(`${LOG_PREFIX} Master workload data:`, data?.length || 0, 'records');
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getMasterWorkload failed:`, error);
      return [];
    }
  }

  /**
   * Get master performance metrics (admin) - Rating, completion rate, jobs count
   * Uses get_master_performance RPC function from COMPLETE_SETUP_V2.sql
   */
  async getMasterPerformance(masterId = null) {
    debug(`${LOG_PREFIX} Fetching master performance...`);

    try {
      const { data, error } = await supabase.rpc('get_master_performance', {
        p_master_id: masterId
      });

      if (error) {
        console.error(`${LOG_PREFIX} getMasterPerformance RPC error:`, error);
        throw error;
      }

      debug(`${LOG_PREFIX} Master performance data:`, data?.length || 0, 'records');
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getMasterPerformance failed:`, error);
      return [];
    }
  }

  /**
   * Get dispatcher metrics (admin) - Total orders, confirmed, disputed counts
   * Uses get_dispatcher_metrics RPC function from COMPLETE_SETUP_V2.sql
   */
  async getDispatcherMetrics(dispatcherId = null) {
    debug(`${LOG_PREFIX} Fetching dispatcher metrics...`);

    try {
      const { data, error } = await supabase.rpc('get_dispatcher_metrics', {
        p_dispatcher_id: dispatcherId
      });

      if (error) {
        console.error(`${LOG_PREFIX} getDispatcherMetrics RPC error:`, error);
        throw error;
      }

      debug(`${LOG_PREFIX} Dispatcher metrics:`, data?.length || 0, 'records');
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getDispatcherMetrics failed:`, error);
      return [];
    }
  }

  /**
   * Set initial deposit for new master (admin only)
   * Uses set_master_initial_deposit RPC function from COMPLETE_SETUP_V2.sql
   */
  async setMasterInitialDeposit(masterId, depositAmount) {
    debug(`${LOG_PREFIX} Setting initial deposit for master ${masterId}: ${depositAmount}`);

    try {
      const { data, error } = await supabase.rpc('set_master_initial_deposit', {
        p_master_id: masterId,
        p_deposit: depositAmount
      });

      if (error) {
        console.error(`${LOG_PREFIX} setMasterInitialDeposit RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        return { success: false, message: data.message || 'Failed to set deposit' };
      }

      debug(`${LOG_PREFIX} Initial deposit set:`, data);
      return { success: true, message: `Deposit of ${depositAmount} set`, deposit: data.deposit };
    } catch (error) {
      console.error(`${LOG_PREFIX} setMasterInitialDeposit failed:`, error);
      return { success: false, message: error.message };
    }
  }
}

const authService = new AuthService();
export default authService;
