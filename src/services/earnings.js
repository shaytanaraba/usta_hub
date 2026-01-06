/**
 * Earnings Service - v5 Schema
 * Handles master financial tracking and commission management
 */

import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[EarningsService]';

class EarningsService {
    // ============================================
    // MASTER FUNCTIONS
    // ============================================

    /**
     * Get master's financial summary
     */
    async getMasterFinancialSummary(masterId) {
        console.log(`${LOG_PREFIX} Fetching financial summary for master: ${masterId}`);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('total_earnings, total_commission_owed, total_commission_paid, completed_jobs_count')
                .eq('id', masterId)
                .single();

            if (error) throw error;

            const summary = {
                totalEarnings: Number(data.total_earnings) || 0,
                commissionOwed: Number(data.total_commission_owed) || 0,
                commissionPaid: Number(data.total_commission_paid) || 0,
                completedJobs: data.completed_jobs_count || 0,
                netEarnings: (Number(data.total_earnings) || 0) - (Number(data.total_commission_paid) || 0) - (Number(data.total_commission_owed) || 0)
            };

            console.log(`${LOG_PREFIX} Summary:`, summary);
            return summary;
        } catch (error) {
            console.error(`${LOG_PREFIX} getMasterFinancialSummary failed:`, error);
            return {
                totalEarnings: 0,
                commissionOwed: 0,
                commissionPaid: 0,
                completedJobs: 0,
                netEarnings: 0
            };
        }
    }

    /**
     * Get master's earnings history
     */
    async getMasterEarnings(masterId, limit = 50) {
        console.log(`${LOG_PREFIX} Fetching earnings history for master: ${masterId}`);

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
            console.log(`${LOG_PREFIX} Found ${data.length} earnings records`);
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
        console.log(`${LOG_PREFIX} Fetching pending earnings for master: ${masterId}`);

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
        console.log(`${LOG_PREFIX} Fetching commission collection status...`);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, phone, total_earnings, total_commission_owed, total_commission_paid')
                .eq('role', 'master')
                .gt('total_commission_owed', 0)
                .order('total_commission_owed', { ascending: false });

            if (error) throw error;
            console.log(`${LOG_PREFIX} Found ${data.length} masters with outstanding commission`);
            return data;
        } catch (error) {
            console.error(`${LOG_PREFIX} getCommissionCollectionStatus failed:`, error);
            return [];
        }
    }

    /**
     * Record commission payment from master
     */
    async recordCommissionPayment(masterId, paymentData, confirmerId) {
        console.log(`${LOG_PREFIX} Recording commission payment from master: ${masterId}`);

        try {
            const { amount, paymentMethod, paymentReference, notes } = paymentData;

            if (!amount || amount <= 0) {
                throw new Error('Payment amount is required');
            }

            if (!paymentMethod) {
                throw new Error('Payment method is required');
            }

            // Get pending earnings to mark as paid
            const { data: pendingEarnings, error: fetchError } = await supabase
                .from('master_earnings')
                .select('id, commission_amount')
                .eq('master_id', masterId)
                .eq('status', 'pending')
                .order('created_at', { ascending: true });

            if (fetchError) throw fetchError;

            // Calculate which earnings to mark as paid
            let runningTotal = 0;
            const earningIdsToUpdate = [];

            for (const earning of pendingEarnings) {
                if (runningTotal + Number(earning.commission_amount) <= amount) {
                    earningIdsToUpdate.push(earning.id);
                    runningTotal += Number(earning.commission_amount);
                } else {
                    break;
                }
            }

            // Create payment record
            const { data: payment, error: paymentError } = await supabase
                .from('commission_payments')
                .insert({
                    master_id: masterId,
                    amount: amount,
                    payment_method: paymentMethod,
                    payment_reference: paymentReference,
                    confirmed_by: confirmerId,
                    confirmation_notes: notes,
                    earning_ids: earningIdsToUpdate
                })
                .select()
                .single();

            if (paymentError) throw paymentError;

            // Update earnings to paid status
            if (earningIdsToUpdate.length > 0) {
                const { error: updateError } = await supabase
                    .from('master_earnings')
                    .update({
                        status: 'paid',
                        paid_at: new Date().toISOString(),
                        payment_method: paymentMethod,
                        payment_reference: paymentReference,
                        confirmed_by: confirmerId
                    })
                    .in('id', earningIdsToUpdate);

                if (updateError) {
                    console.error(`${LOG_PREFIX} Failed to update earnings:`, updateError);
                }
            }

            console.log(`${LOG_PREFIX} Commission payment recorded: ${payment.id}`);
            return {
                success: true,
                message: `Payment of ${amount} recorded. ${earningIdsToUpdate.length} earnings marked as paid.`,
                payment
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
        console.log(`${LOG_PREFIX} Fetching commission payments for master: ${masterId}`);

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
     */
    async getCommissionStats() {
        console.log(`${LOG_PREFIX} Fetching commission statistics...`);

        try {
            const { data: masters, error } = await supabase
                .from('profiles')
                .select('total_commission_owed, total_commission_paid')
                .eq('role', 'master');

            if (error) throw error;

            const stats = {
                totalOutstanding: masters.reduce((sum, m) => sum + (Number(m.total_commission_owed) || 0), 0),
                totalCollected: masters.reduce((sum, m) => sum + (Number(m.total_commission_paid) || 0), 0),
                mastersWithDebt: masters.filter(m => Number(m.total_commission_owed) > 0).length
            };

            console.log(`${LOG_PREFIX} Commission stats:`, stats);
            return stats;
        } catch (error) {
            console.error(`${LOG_PREFIX} getCommissionStats failed:`, error);
            return { totalOutstanding: 0, totalCollected: 0, mastersWithDebt: 0 };
        }
    }
}

const earningsService = new EarningsService();
export default earningsService;
