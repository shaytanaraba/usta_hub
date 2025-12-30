
/**
 * Settings Service
 * Handles platform global settings
 */

import { supabase } from '../lib/supabase';

class SettingsService {
    constructor() {
        this.defaultSettings = {
            commissionRate: 0.15,
            supportEmail: 'support@plumberhub.com',
            supportPhone: '',
            bankDetails: {}
        };
    }

    /**
     * Get platform settings
     */
    async getSettings() {
        try {
            const { data, error } = await supabase
                .from('platform_settings')
                .select('*')
                .single();

            if (error) {
                // If table doesn't exist or empty, return default (handling dev environments)
                console.warn('Could not fetch settings (using defaults):', error.message);
                return this.defaultSettings;
            }

            return {
                id: data.id,
                commissionRate: parseFloat(data.commission_rate),
                supportEmail: data.support_email,
                supportPhone: data.support_phone,
                bankDetails: data.bank_details || {}
            };
        } catch (error) {
            console.error('Settings service error:', error);
            return this.defaultSettings;
        }
    }

    /**
     * Update settings (Admin only)
     */
    async updateSettings(updates) {
        try {
            const dbUpdates = {};
            if (updates.commissionRate !== undefined) dbUpdates.commission_rate = updates.commissionRate;
            if (updates.supportEmail !== undefined) dbUpdates.support_email = updates.supportEmail;
            if (updates.supportPhone !== undefined) dbUpdates.support_phone = updates.supportPhone;
            if (updates.bankDetails !== undefined) dbUpdates.bank_details = updates.bankDetails;

            // Check if row exists, if not insert
            const { data: existing } = await supabase.from('platform_settings').select('id').limit(1);

            let error;
            if (existing && existing.length > 0) {
                const result = await supabase
                    .from('platform_settings')
                    .update(dbUpdates)
                    .eq('id', existing[0].id)
                    .select()
                    .single();
                error = result.error;
            } else {
                const result = await supabase
                    .from('platform_settings')
                    .insert(dbUpdates)
                    .select()
                    .single();
                error = result.error;
            }

            if (error) throw error;

            return { success: true, message: 'Settings updated successfully' };
        } catch (error) {
            console.error('Update settings error:', error);
            return { success: false, message: error.message };
        }
    }
}

const settingsService = new SettingsService();
export default settingsService;
