/**
 * Auth Service - v5 Schema
 * Handles authentication with role-based access (admin/dispatcher/master/client)
 */

import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[AuthService]';
const isDebug = process?.env?.EXPO_PUBLIC_ENABLE_AUTH_LOGS === '1';
const debug = (...args) => {
  if (isDebug) console.log(...args);
};
const debugWarn = (...args) => {
  if (isDebug) console.warn(...args);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Profile columns used across auth + dashboards. Keep in sync with COMPLETE_SETUP_V2.sql.
const PROFILE_SELECT_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'service_area',
  'experience_years',
  'specializations',
  'max_active_jobs',
  'max_immediate_orders',
  'max_pending_confirmation',
  'prepaid_balance',
  'initial_deposit',
  'completed_jobs_count',
  'created_at'
].join(', ');

const MASTER_LIST_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'is_verified',
  'service_area',
  'experience_years',
  'specializations',
  'max_active_jobs',
  'prepaid_balance',
  'initial_deposit',
  'completed_jobs_count',
  'created_at'
].join(', ');

const DISPATCHER_LIST_FIELDS = [
  'id',
  'email',
  'phone',
  'full_name',
  'role',
  'is_active',
  'created_at'
].join(', ');

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
  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('econnreset')
    || message.includes('eai_again');
};

class AuthService {
  constructor() {
    this.redirects = {
      admin: 'AdminDashboard',
      dispatcher: 'DispatcherDashboard',
      master: 'MasterDashboard',
      client: null, // Clients cannot login in v5 (dispatcher-mediated)
    };
  }

  /**
   * Login user - v5 uses 'role' field instead of 'user_type'
   */
  async loginUser(email, password) {
    debug(`${LOG_PREFIX} Attempting login for: ${email}`);

    try {
      if (!email?.trim() || !password) {
        throw new Error('Email and password are required');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        console.error(`${LOG_PREFIX} Auth error:`, error.message);
        throw error;
      }

      debug(`${LOG_PREFIX} Auth successful, fetching profile...`);

      // Fetch profile with v5 fields
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_FIELDS)
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        console.error(`${LOG_PREFIX} Profile error:`, profileError?.message);
        await this.logoutUser();
        throw new Error('User profile not found');
      }

      // Check if user is active
      if (!profile.is_active) {
        debugWarn(`${LOG_PREFIX} User deactivated:`, profile.id);
        await this.logoutUser();
        throw new Error('Account deactivated. Contact administrator.');
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

      return {
        success: true,
        message: 'Login successful',
        user: { ...data.user, ...profile },
        redirectScreen,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Login failed:`, error.message);
      const msg = error.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : error.message;
      return { success: false, message: msg };
    }
  }

  /**
   * Get current logged-in user with full profile
   */
  async getCurrentUser(options = {}) {
    debug(`${LOG_PREFIX} Getting current user...`);

    try {
      const session = options.session
        ? options.session
        : (await supabase.auth.getSession()).data.session;

      if (!session) {
        debug(`${LOG_PREFIX} No active session`);
        return null;
      }

      const retries = Number.isInteger(options.retries) ? options.retries : 0;
      const retryDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 300;
      let attempt = 0;

      while (attempt <= retries) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_FIELDS)
          .eq('id', session.user.id)
          .single();

        if (!error && profile) {
          debug(`${LOG_PREFIX} Current user: ${profile.full_name} (${profile.role})`);
          return { ...session.user, ...profile };
        }

        if (error) {
          console.error(`${LOG_PREFIX} Profile fetch error:`, error?.message);
          if (isAuthInvalidError(error)) {
            await supabase.auth.signOut({ scope: 'local' });
            return null;
          }
          if (attempt < retries && isTransientError(error)) {
            attempt += 1;
            await sleep(retryDelayMs);
            continue;
          }
        }
        return null;
      }
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

    try {
      const scope = options.scope || 'local';
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
    debug(`${LOG_PREFIX} Fetching all masters...`);

    try {
      let query = supabase
        .from('profiles')
        .select(MASTER_LIST_FIELDS)
        .eq('role', 'master')
        .order('created_at', { ascending: false });

      if (Number.isInteger(options.page) && Number.isInteger(options.pageSize)) {
        const start = options.page * options.pageSize;
        const end = start + options.pageSize - 1;
        query = query.range(start, end);
      }

      const { data, error } = await query;

      if (error) throw error;
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
    debug(`${LOG_PREFIX} Fetching all dispatchers...`);

    try {
      let query = supabase
        .from('profiles')
        .select(DISPATCHER_LIST_FIELDS)
        .eq('role', 'dispatcher')
        .order('created_at', { ascending: false });

      if (Number.isInteger(options.page) && Number.isInteger(options.pageSize)) {
        const start = options.page * options.pageSize;
        const end = start + options.pageSize - 1;
        query = query.range(start, end);
      }

      const { data, error } = await query;

      if (error) throw error;
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
    debug(`${LOG_PREFIX} Fetching all admins...`);

    try {
      let query = supabase
        .from('profiles')
        .select(DISPATCHER_LIST_FIELDS)
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (Number.isInteger(options.page) && Number.isInteger(options.pageSize)) {
        const start = options.page * options.pageSize;
        const end = start + options.pageSize - 1;
        query = query.range(start, end);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllAdmins error:`, error);
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
      const profileUpdates = {};

      if (updates.full_name) profileUpdates.full_name = updates.full_name;
      if (updates.phone) profileUpdates.phone = updates.phone;
      if (updates.email) profileUpdates.email = updates.email;
      if (updates.service_area) profileUpdates.service_area = updates.service_area;
      if (updates.experience_years !== undefined) profileUpdates.experience_years = parseInt(updates.experience_years) || 0;
      if (updates.specializations) profileUpdates.specializations = updates.specializations;
      if (updates.max_active_jobs !== undefined) profileUpdates.max_active_jobs = updates.max_active_jobs;

      const { data, error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Profile updated', user: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updateProfile error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Create new user (admin only) - Creates user in auth + profile
   * Used to add new masters or dispatchers
   */
  async createUser(userData) {
    debug(`${LOG_PREFIX} Creating new user: ${userData.email} (${userData.role})`);

    try {
      if (!userData.email || !userData.password || !userData.role) {
        throw new Error('Email, password, and role are required');
      }

      if (!['master', 'dispatcher'].includes(userData.role)) {
        throw new Error('Role must be master or dispatcher');
      }

      // Create auth user via Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email.trim().toLowerCase(),
        password: userData.password,
        options: {
          data: {
            full_name: userData.full_name || '',
            phone: userData.phone || '',
            role: userData.role
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

      // Update profile with additional details (trigger should have created basic profile)
      const profileUpdates = {
        full_name: userData.full_name || '',
        phone: userData.phone || '',
        role: userData.role,
        is_active: true,
        is_verified: userData.role === 'dispatcher', // Dispatchers auto-verified
      };

      if (userData.role === 'master') {
        profileUpdates.service_area = userData.service_area || '';
        profileUpdates.experience_years = parseInt(userData.experience_years) || 0;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', authData.user.id)
        .select()
        .single();

      if (profileError) {
        console.error(`${LOG_PREFIX} Profile update error:`, profileError);
        // User created but profile update failed - still return success with warning
        return {
          success: true,
          message: 'User created but profile update failed. Refresh to see changes.',
          user: { id: authData.user.id, email: userData.email, role: userData.role }
        };
      }

      debug(`${LOG_PREFIX} User created successfully: ${profile.full_name}`);
      return {
        success: true,
        message: `${userData.role === 'master' ? 'Master' : 'Dispatcher'} created successfully`,
        user: profile
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} createUser error:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reset user password (admin only) - Securely resets password for masters/dispatchers
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
