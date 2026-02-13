/**
 * Earnings Service - v5 Schema
 * Handles master financial tracking and commission management
 */

import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[EarningsService]';
const ENABLE_EARNINGS_LOGS = process?.env?.EXPO_PUBLIC_ENABLE_EARNINGS_LOGS === '1';
const earningsLog = (...args) => {
    if (ENABLE_EARNINGS_LOGS) {
        console.log(...args);
    }
};

class EarningsService {
    // ============================================
    // MASTER FUNCTIONS
    // ============================================

    /**
     * Get master's financial summary with balance system fields
     */
    async getMasterFinancialSummary(masterId) {
        earningsLog(`${LOG_PREFIX} Fetching financial summary for master: ${masterId}`);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    total_earnings, total_commission_owed, total_commission_paid, 
                    completed_jobs_count, prepaid_balance, initial_deposit, 
                    balance_blocked_at, balance_threshold, refusal_count, rating,
                    max_active_jobs, service_area, license_number,
                    specializations, full_name, email, phone
                `)
                .eq('id', masterId)
                .single();

            if (error) throw error;

            const summary = {
                totalEarnings: Number(data.total_earnings) || 0,
                commissionOwed: Number(data.total_commission_owed) || 0,
                commissionPaid: Number(data.total_commission_paid) || 0,
                completedJobs: data.completed_jobs_count || 0,
                netEarnings: (Number(data.total_earnings) || 0) - (Number(data.total_commission_paid) || 0) - (Number(data.total_commission_owed) || 0),
                // Balance system fields
                prepaidBalance: Number(data.prepaid_balance) || 0,
                initialDeposit: Number(data.initial_deposit) || 0,
                balanceBlocked: !!data.balance_blocked_at,
                balanceThreshold: Number(data.balance_threshold) || 0,
                // Performance fields
                refusalCount: data.refusal_count || 0,
                rating: Number(data.rating) || 0,
                // Profile fields for My Account
                maxActiveJobs: data.max_active_jobs || 2,
                serviceArea: data.service_area || '',
                licenseNumber: data.license_number || '',
                specializations: data.specializations || [],
                fullName: data.full_name || '',
                email: data.email || '',
                phone: data.phone || ''
            };

            earningsLog(`${LOG_PREFIX} Summary:`, summary);
            return summary;
        } catch (error) {
            console.error(`${LOG_PREFIX} getMasterFinancialSummary failed:`, error);
            return {
                totalEarnings: 0,
                commissionOwed: 0,
                commissionPaid: 0,
                completedJobs: 0,
                netEarnings: 0,
                prepaidBalance: 0,
                initialDeposit: 0,
                balanceBlocked: false,
                balanceThreshold: 0,
                refusalCount: 0,
                rating: 0,
                maxActiveJobs: 2,
                serviceArea: '',
                licenseNumber: '',
                specializations: [],
                fullName: '',
                email: '',
                phone: ''
            };
        }
    }

    /**
     * Get master's earnings history
     */
    async getMasterEarnings(masterId, limit = 50) {
        earningsLog(`${LOG_PREFIX} Fetching earnings history for master: ${masterId}`);

        try {
            const { data, error } = await supabase
                .from('master_earnings')
                .select(`
          *,
          order:order_id(
            service_type,
            area,
            confirmed_at
          )
        `)
                .eq('master_id', masterId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            earningsLog(`${LOG_PREFIX} Found ${data.length} earnings records`);
            return data;
        } catch (error) {
            console.error(`${LOG_PREFIX} getMasterEarnings failed:`, error);
            return [];
        }
    }

    /**
     * Get pending earnings (commission not yet paid)
     */
    async getPendingEarnings(masterId) {
        earningsLog(`${LOG_PREFIX} Fetching pending earnings for master: ${masterId}`);

        try {
            const { data, error } = await supabase
                .from('master_earnings')
                .select('*')
                .eq('master_id', masterId)
                .eq('status', 'pending')
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`${LOG_PREFIX} getPendingEarnings failed:`, error);
            return [];
        }
    }

    // ============================================
    // ADMIN/DISPATCHER FUNCTIONS
    // ============================================

    /**
     * Get commission collection status (all masters with outstanding balance)
     */
    async getCommissionCollectionStatus() {
        earningsLog(`${LOG_PREFIX} Fetching commission collection status...`);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone, total_earnings, total_commission_owed, total_commission_paid')
                .eq('role', 'master')
                .gt('total_commission_owed', 0)
                .order('total_commission_owed', { ascending: false });

            if (error) throw error;
            earningsLog(`${LOG_PREFIX} Found ${data.length} masters with outstanding commission`);
            return data;
        } catch (error) {
            console.error(`${LOG_PREFIX} getCommissionCollectionStatus failed:`, error);
            return [];
        }
    }

    /**
     * Record commission payment from master
     * 
     * IMPORTANT: Commission payments do NOT generate new commission.
     * This function only marks existing earnings (from confirmed orders) as paid.
     * The trigger update_master_totals_on_earning_paid moves the amount from
     * total_commission_owed to total_commission_paid without creating new earnings.
     */
    async recordCommissionPayment(masterId, paymentData, confirmerId) {
        earningsLog(`${LOG_PREFIX} Recording commission payment (RPC) from master: ${masterId}`);

        try {
            const { amount, paymentMethod, paymentReference, notes } = paymentData;

            if (!amount || amount <= 0) {
                throw new Error('Payment amount is required');
            }

            // Call the documented RPC function
            const { data, error } = await supabase.rpc('record_commission_payment', {
                p_master_id: masterId,
                p_amount: amount,
                p_payment_method: paymentMethod || 'cash',
                p_payment_ref: paymentReference || null,
                p_notes: notes || `Confirmed by ${confirmerId}`
            });

            if (error) {
                console.error(`${LOG_PREFIX} RPC error:`, error);
                throw error;
            }

            earningsLog(`${LOG_PREFIX} Payment recorded successfully via RPC:`, data);

            return {
                success: true,
                message: `Payment of ${amount} recorded successfully`,
                paymentId: data // RPC returns the new payment UUID
            };
        } catch (error) {
            console.error(`${LOG_PREFIX} recordCommissionPayment failed:`, error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Get commission payment history for master
     */
    async getCommissionPayments(masterId) {
        earningsLog(`${LOG_PREFIX} Fetching commission payments for master: ${masterId}`);

        try {
            const { data, error } = await supabase
                .from('commission_payments')
                .select(`
          *,
          confirmed_by_user:confirmed_by(full_name)
        `)
                .eq('master_id', masterId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error(`${LOG_PREFIX} getCommissionPayments failed:`, error);
            return [];
        }
    }

    /**
     * Get platform commission statistics
     * @param {Object} dateFilter - { type: 'all'|'today'|'week'|'month'|'custom', start?, end? }
     * @returns {Object} { totalOutstanding, totalCollected, mastersWithDebt: Array }
     */
    async getCommissionStats(dateFilter = { type: 'all' }) {
        earningsLog(`${LOG_PREFIX} Fetching commission statistics with filter:`, dateFilter);

        try {
            // Commission is now deducted directly from balance transactions
            let query = supabase
                .from('balance_transactions')
                .select('amount, transaction_type, created_at')
                .in('transaction_type', ['commission', 'commission_deduct']);

            // Apply date filters if needed
            if (dateFilter.type !== 'all') {
                const now = new Date();
                let startDate;

                switch (dateFilter.type) {
                    case 'today':
                        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        break;
                    case 'week':
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'month':
                        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    case 'custom':
                        if (dateFilter.start) {
                            startDate = new Date(dateFilter.start);
                        }
                        if (dateFilter.end) {
                            query = query.lte('created_at', new Date(dateFilter.end).toISOString());
                        }
                        break;
                }

                if (startDate) {
                    query = query.gte('created_at', startDate.toISOString());
                }
            }

            const { data: transactions, error } = await query;
            if (error) throw error;

            const totalCollected = (transactions || [])
                .map(t => Number(t.amount))
                .filter(val => Number.isFinite(val))
                .reduce((sum, val) => sum + Math.abs(val), 0);

            const stats = {
                totalOutstanding: 0,
                totalCollected,
                mastersWithDebt: []
            };

            earningsLog(`${LOG_PREFIX} Commission stats:`, stats);
            return stats;
        } catch (error) {
            console.error(`${LOG_PREFIX} getCommissionStats failed:`, error);
            return { totalOutstanding: 0, totalCollected: 0, mastersWithDebt: [] };
        }
    }

    /**
     * Get balance transaction history for master
     * Used in My Account tab to show deposit/commission history
     */
    async getBalanceTransactions(masterId, limit = 30) {
        earningsLog(`${LOG_PREFIX} Fetching balance transactions for master: ${masterId}`);
        try {
            const { data, error } = await supabase
                .from('balance_transactions')
                .select('id, amount, transaction_type, balance_before, balance_after, notes, created_at')
                .eq('master_id', masterId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error(`${LOG_PREFIX} getBalanceTransactions failed:`, error);
            return [];
        }
    }

    /**
     * Get aggregate top-up stats across all masters
     * @param {Date|null} startDate
     * @param {Date|null} endDate
     */
    async getBalanceTopUpStats(startDate = null, endDate = null) {
        try {
            let query = supabase
                .from('balance_transactions')
                .select('amount, created_at, transaction_type')
                .eq('transaction_type', 'top_up');

            if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
                query = query.gte('created_at', startDate.toISOString());
            }
            if (endDate instanceof Date && !Number.isNaN(endDate.getTime())) {
                query = query.lte('created_at', endDate.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;

            const amounts = (data || [])
                .map(item => Number(item.amount))
                .filter(val => Number.isFinite(val) && val > 0);

            const totalTopUps = amounts.reduce((sum, val) => sum + val, 0);
            const count = amounts.length;
            const avgTopUp = count ? totalTopUps / count : 0;

            return { totalTopUps, avgTopUp, count };
        } catch (error) {
            console.error(`${LOG_PREFIX} getBalanceTopUpStats failed:`, error);
            return { totalTopUps: 0, avgTopUp: 0, count: 0 };
        }
    }

    // ============================================
    // ADMIN BALANCE MANAGEMENT (Missing DB Wrappers)
    // ============================================

    /**
     * Add balance to master account (admin only)
     * Uses add_master_balance RPC function from COMPLETE_SETUP_V2.sql
     * @param {string} masterId - Master UUID
     * @param {number} amount - Amount to add (positive) or deduct (negative)
     * @param {string} transactionType - 'top_up', 'adjustment', 'refund', 'waiver'
     * @param {string} notes - Optional notes for the transaction
     */
    async addMasterBalance(masterId, amount, transactionType = 'top_up', notes = null) {
        earningsLog(`${LOG_PREFIX} Adding balance to master ${masterId}: ${amount} (${transactionType})`);

        try {
            const { data, error } = await supabase.rpc('add_master_balance', {
                p_master_id: masterId,
                p_amount: amount,
                p_transaction_type: transactionType,
                p_notes: notes
            });

            if (error) {
                console.error(`${LOG_PREFIX} addMasterBalance RPC error:`, error);
                throw error;
            }

            if (!data.success) {
                return { success: false, message: data.message || 'Failed to add balance' };
            }

            earningsLog(`${LOG_PREFIX} Balance updated:`, data);
            return {
                success: true,
                message: `Balance updated from ${data.balance_before} to ${data.balance_after}`,
                balanceBefore: data.balance_before,
                balanceAfter: data.balance_after
            };
        } catch (error) {
            console.error(`${LOG_PREFIX} addMasterBalance failed:`, error);
            return { success: false, message: error.message };
        }
    }
}

const earningsService = new EarningsService();
export default earningsService;
