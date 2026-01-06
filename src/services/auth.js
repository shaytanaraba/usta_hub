/**
 * Auth Service - v5 Schema
 * Handles authentication with role-based access (admin/dispatcher/master/client)
 */

import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[AuthService]';

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
    console.log(`${LOG_PREFIX} Attempting login for: ${email}`);

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

      console.log(`${LOG_PREFIX} Auth successful, fetching profile...`);

      // Fetch profile with v5 fields
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        console.error(`${LOG_PREFIX} Profile error:`, profileError?.message);
        await this.logoutUser();
        throw new Error('User profile not found');
      }

      // Check if user is active
      if (!profile.is_active) {
        console.warn(`${LOG_PREFIX} User deactivated:`, profile.id);
        await this.logoutUser();
        throw new Error('Account deactivated. Contact administrator.');
      }

      // Block client logins in v5 (dispatcher-mediated architecture)
      if (profile.role === 'client') {
        console.warn(`${LOG_PREFIX} Client login blocked:`, profile.id);
        await this.logoutUser();
        throw new Error('Client accounts cannot login. Contact dispatcher for service.');
      }

      const redirectScreen = this.redirects[profile.role];
      if (!redirectScreen) {
        console.error(`${LOG_PREFIX} No redirect screen for role:`, profile.role);
        await this.logoutUser();
        throw new Error('Invalid user role. Contact administrator.');
      }

      console.log(`${LOG_PREFIX} Login successful. Role: ${profile.role}`);

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
  async getCurrentUser() {
    console.log(`${LOG_PREFIX} Getting current user...`);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.log(`${LOG_PREFIX} No active session`);
        return null;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) {
        console.error(`${LOG_PREFIX} Profile fetch error:`, error?.message);
        return null;
      }

      console.log(`${LOG_PREFIX} Current user: ${profile.full_name} (${profile.role})`);
      return { ...session.user, ...profile };
    } catch (error) {
      console.error(`${LOG_PREFIX} getCurrentUser error:`, error);
      return null;
    }
  }

  /**
   * Logout user
   */
  async logoutUser() {
    console.log(`${LOG_PREFIX} Logging out...`);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      console.log(`${LOG_PREFIX} Logout successful`);
      return { success: true };
    } catch (error) {
      console.error(`${LOG_PREFIX} Logout error:`, error);
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
  async getAllMasters() {
    console.log(`${LOG_PREFIX} Fetching all masters...`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'master')
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log(`${LOG_PREFIX} Found ${data.length} masters`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllMasters error:`, error);
      return [];
    }
  }

  /**
   * Get all dispatchers (admin)
   */
  async getAllDispatchers() {
    console.log(`${LOG_PREFIX} Fetching all dispatchers...`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'dispatcher')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllDispatchers error:`, error);
      return [];
    }
  }

  /**
   * Verify master (admin only)
   */
  async verifyMaster(masterId) {
    console.log(`${LOG_PREFIX} Verifying master: ${masterId}`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', masterId)
        .eq('role', 'master')
        .select()
        .single();

      if (error) throw error;
      console.log(`${LOG_PREFIX} Master verified successfully`);
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
    console.log(`${LOG_PREFIX} Unverifying master: ${masterId}`);

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
    console.log(`${LOG_PREFIX} Updating profile: ${userId}`);

    try {
      const profileUpdates = {};

      if (updates.full_name) profileUpdates.full_name = updates.full_name;
      if (updates.phone) profileUpdates.phone = updates.phone;
      if (updates.service_area) profileUpdates.service_area = updates.service_area;
      if (updates.experience_years) profileUpdates.experience_years = updates.experience_years;
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
}

const authService = new AuthService();
export default authService;