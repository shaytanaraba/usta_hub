/**
 * Authentication Service
 * Handles user registration, login, logout, and session management via Supabase
 */

import { supabase } from '../lib/supabase';
import {
  validateEmail,
  validateAndNormalizePhone,
  validatePassword,
  validateName,
  validateExperience,
} from '../utils/validation';

class AuthService {
  constructor() {
    this.redirects = {
      client: 'ClientDashboard',
      plumber: 'PlumberDashboard',
      admin: 'AdminDashboard',
    };
  }

  /**
   * Register new user
   */
  async registerUser(userData) {
    try {
      // 1. Validate required fields
      const validation = this.validateRegistrationData(userData);
      if (!validation.isValid) {
        throw new Error(validation.message);
      }

      // 2. Normalize data
      const phoneValidation = validateAndNormalizePhone(userData.phone);
      const normalizedPhone = phoneValidation.phone;

      const emailValidation = validateEmail(userData.email);
      const normalizedEmail = emailValidation.email;

      // 3. Sign Up with Supabase
      // We pass userType, name, phone in metadata so the SQL trigger can create the profile
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: userData.password,
        options: {
          data: {
            userType: userData.userType,
            name: userData.name.trim(),
            phone: normalizedPhone,
          },
        },
      });

      if (error) throw error;
      if (!data.user) throw new Error('Registration failed: No user created');

      const userId = data.user.id;

      // 4. If Plumber, update the specific profile fields
      if (userData.userType === 'plumber') {
        const plumberUpdates = {
          license_number: userData.licenseNumber?.trim() || null,
          service_area: userData.serviceArea?.trim(),
          experience: userData.experience?.trim(),
          specializations: userData.specializations || [],
          is_verified: false, // Explicitly set to false (Admin must verify)
          rating: 0,
          completed_jobs: 0,
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .update(plumberUpdates)
          .eq('id', userId);

        if (profileError) {
          console.error('Error updating plumber profile:', profileError);
          // Don't fail the whole registration, but log it. 
          // User might need to re-enter this info later if it fails here.
        }
      }

      return {
        success: true,
        message: 'Registration successful! Please login.',
        user: data.user,
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: error.message || 'Registration failed. Please try again.',
      };
    }
  }

  /**
   * Login user
   */
  async loginUser(email, password, userType = null) {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // 1. Sign In
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;

      // 2. Get Profile to check userType and Verification
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('User profile not found.');
      }

      // 3. Role Check (Optional override)
      // If the UI requested a specific role login, we enforce it here
      if (userType && profile.user_type !== userType) {
        // Sign out immediately if role doesn't match
        await this.logoutUser();
        throw new Error(`Invalid credentials for ${userType} account`);
      }

      return {
        success: true,
        message: 'Login successful',
        user: { ...data.user, ...profile }, // Merge auth user with profile data
        redirectScreen: this.redirects[profile.user_type],
      };
    } catch (error) {
      // If "Invalid login credentials", provide a friendly message
      const msg = error.message === 'Invalid login credentials'
        ? 'Invalid email or password'
        : error.message;

      return {
        success: false,
        message: msg || 'Login failed',
      };
    }
  }

  /**
   * Logout user
   */
  async logoutUser() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get current logged-in user with profile
   */
  async getCurrentUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      return profile ? { ...session.user, ...profile } : null;
    } catch (error) {
      return null;
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
   * Check authentication and return user
   */
  async checkAuth() {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('Not authenticated');
    }
    return user;
  }

  /**
   * Require specific user role
   */
  async requireRole(requiredRole) {
    const user = await this.checkAuth();

    if (user.user_type !== requiredRole) {
      throw new Error(`Access denied. ${requiredRole} role required.`);
    }

    return user;
  }

  /**
   * Validate registration data
   */
  validateRegistrationData(userData) {
    if (!userData.userType) {
      return { isValid: false, message: 'Please select account type (Client or Plumber)' };
    }

    const nameValidation = validateName(userData.name);
    if (!nameValidation.isValid) return nameValidation;

    const emailValidation = validateEmail(userData.email);
    if (!emailValidation.isValid) return emailValidation;

    const phoneValidation = validateAndNormalizePhone(userData.phone);
    if (!phoneValidation.isValid) return phoneValidation;

    const passwordValidation = validatePassword(userData.password);
    if (!passwordValidation.isValid) return passwordValidation;

    if (userData.password !== userData.confirmPassword) {
      return { isValid: false, message: 'Passwords do not match' };
    }

    // Plumber-specific fields are now optional during registration
    // They can be filled in later via PlumberProfileSettings screen

    return { isValid: true, message: 'Validation passed' };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates) {
    try {
      // 1. Check if email is being updated (requires unique check)
      if (updates.email) {
        // Supabase handles unique email constraints automatically, 
        // but we should validate format first.
        const { isValid, message } = validateEmail(updates.email);
        if (!isValid) throw new Error(message);
      }

      // 2. Update Auth User (email/password/metadata) if needed
      // Note: Changing email sends a confirmation link by default in Supabase
      const authUpdates = {};
      if (updates.email) authUpdates.email = updates.email;
      if (updates.password) authUpdates.password = updates.password;

      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdates);
        if (authError) throw authError;
      }

      // 3. Update Profiles Table (for other fields)
      const profileUpdates = {};
      if (updates.name) profileUpdates.full_name = updates.name;
      if (updates.phone) {
        const { isValid, phone } = validateAndNormalizePhone(updates.phone);
        if (!isValid) throw new Error('Invalid phone number');
        profileUpdates.phone = phone;
      }

      // Plumber specific fields
      if (updates.licenseNumber !== undefined) profileUpdates.license_number = updates.licenseNumber;
      if (updates.serviceArea) profileUpdates.service_area = updates.serviceArea;
      if (updates.experience) profileUpdates.experience = updates.experience;
      if (updates.specializations) profileUpdates.specializations = updates.specializations;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', userId);

        if (profileError) throw profileError;
      }

      // Return success with updated user
      const updatedUser = await this.getCurrentUser();
      return {
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser,
      };
    } catch (error) {
      console.error('Update profile error:', error);
      return {
        success: false,
        message: error.message || 'Profile update failed',
      };
    }
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Supabase doesn't require "currentPassword" for `updateUser` if you are already logged in.
      // However, for security, we should ideally verify it.
      // Since we can't easily re-verify password without signing in again, 
      // we will just proceed with the update if the session is active.

      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Password change failed',
      };
    }
  }

  /**
   * Get all registered plumbers (admin)
   */
  async getAllPlumbers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_type', 'plumber')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching plumbers:', error);
      return [];
    }
  }

  /**
   * Verify plumber (admin)
   */
  /**
   * Verify plumber (admin)
   */
  async verifyPlumber(plumberId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', plumberId)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('No records updated. Check permissions or if user exists.');
      }

      return { success: true, message: 'Plumber verified successfully' };
    } catch (error) {
      console.error('Verify error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unverify plumber (admin)
   */
  async unverifyPlumber(plumberId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_verified: false })
        .eq('id', plumberId)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('No records updated. Check permissions or if user exists.');
      }

      return { success: true, message: 'Plumber unverified successfully' };
    } catch (error) {
      console.error('Unverify error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get user dashboard screen name
   */
  getDashboardScreen(userType) {
    return this.redirects[userType] || 'Login';
  }
}

// Create and export singleton instance
const auth = new AuthService();

export default auth;