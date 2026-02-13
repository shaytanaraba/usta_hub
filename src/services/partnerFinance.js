import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[PartnerFinanceService]';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class PartnerFinanceService {
  async getPartnerFinanceSummary(partnerId) {
    if (!partnerId) {
      return {
        balance: 0,
        commissionRatePercent: 0,
        minPayout: 50,
        earnedTotal: 0,
        deductedTotal: 0,
        paidTotal: 0,
        requestedTotal: 0,
        pendingRequests: 0,
      };
    }

    try {
      const [{ data: profile }, { data: transactions }, { data: requests }] = await Promise.all([
        supabase
          .from('profiles')
          .select('partner_balance, partner_commission_rate, partner_min_payout')
          .eq('id', partnerId)
          .eq('role', 'partner')
          .single(),
        supabase
          .from('partner_balance_transactions')
          .select('id, transaction_type, amount, balance_before, balance_after, notes, created_at, order_id, payout_request_id')
          .eq('partner_id', partnerId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('partner_payout_requests')
          .select('id, status, requested_amount, approved_amount, requested_note, admin_note, created_at, processed_at')
          .eq('partner_id', partnerId)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const tx = transactions || [];
      const payoutRequests = requests || [];
      const earnedTotal = tx
        .filter((item) => item.transaction_type === 'commission_earned')
        .reduce((sum, item) => sum + toNumber(item.amount), 0);
      const deductedTotal = tx
        .filter((item) => item.transaction_type === 'manual_deduction')
        .reduce((sum, item) => sum + Math.abs(toNumber(item.amount)), 0);
      const paidTotal = tx
        .filter((item) => item.transaction_type === 'payout_paid')
        .reduce((sum, item) => sum + Math.abs(toNumber(item.amount)), 0);
      const requestedTotal = payoutRequests.reduce((sum, item) => sum + toNumber(item.requested_amount), 0);
      const pendingRequests = payoutRequests.filter((item) => item.status === 'requested').length;

      return {
        balance: toNumber(profile?.partner_balance),
        commissionRatePercent: Math.round(toNumber(profile?.partner_commission_rate) * 10000) / 100,
        minPayout: toNumber(profile?.partner_min_payout, 50),
        earnedTotal,
        deductedTotal,
        paidTotal,
        requestedTotal,
        pendingRequests,
        transactions: tx,
        payoutRequests,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} getPartnerFinanceSummary failed`, error);
      return {
        balance: 0,
        commissionRatePercent: 0,
        minPayout: 50,
        earnedTotal: 0,
        deductedTotal: 0,
        paidTotal: 0,
        requestedTotal: 0,
        pendingRequests: 0,
        transactions: [],
        payoutRequests: [],
      };
    }
  }

  async getPartnerPayoutRequests(partnerId, limit = 100) {
    if (!partnerId) return [];
    try {
      const { data, error } = await supabase
        .from('partner_payout_requests')
        .select('id, status, requested_amount, approved_amount, requested_note, admin_note, created_at, processed_at')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getPartnerPayoutRequests failed`, error);
      return [];
    }
  }

  async getPartnerTransactions(partnerId, limit = 100) {
    if (!partnerId) return [];
    try {
      const { data, error } = await supabase
        .from('partner_balance_transactions')
        .select('id, transaction_type, amount, balance_before, balance_after, notes, created_at, order_id, payout_request_id')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getPartnerTransactions failed`, error);
      return [];
    }
  }

  async createPayoutRequest(amount, note = null) {
    try {
      const { data, error } = await supabase.rpc('create_partner_payout_request', {
        p_requested_amount: amount,
        p_requested_note: note,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, message: data?.message || data?.error || 'Failed to create payout request' };
      }
      return { success: true, requestId: data.request_id, message: data.message || 'Payout request created' };
    } catch (error) {
      console.error(`${LOG_PREFIX} createPayoutRequest failed`, error);
      return { success: false, message: error.message };
    }
  }

  async getPartnerPayoutRequestsAdmin({ partnerId = null, status = null, limit = 200 } = {}) {
    try {
      let query = supabase
        .from('partner_payout_requests')
        .select(`
          id,
          partner_id,
          status,
          requested_amount,
          approved_amount,
          requested_note,
          admin_note,
          created_at,
          processed_at,
          processed_by,
          partner:partner_id(id, full_name, phone, email, partner_balance, partner_commission_rate)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (partnerId) query = query.eq('partner_id', partnerId);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getPartnerPayoutRequestsAdmin failed`, error);
      return [];
    }
  }

  async processPartnerPayoutRequest(requestId, action, approvedAmount = null, adminNote = null) {
    try {
      const { data, error } = await supabase.rpc('admin_process_partner_payout_request', {
        p_request_id: requestId,
        p_action: action,
        p_approved_amount: approvedAmount,
        p_admin_note: adminNote,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, message: data?.message || data?.error || 'Failed to process payout request' };
      }
      return { success: true, message: data.message || 'Payout request updated' };
    } catch (error) {
      console.error(`${LOG_PREFIX} processPartnerPayoutRequest failed`, error);
      return { success: false, message: error.message };
    }
  }

  async setPartnerCommissionRate(partnerId, percentValue) {
    try {
      const rate = toNumber(percentValue) / 100;
      const { data, error } = await supabase
        .from('profiles')
        .update({ partner_commission_rate: rate, updated_at: new Date().toISOString() })
        .eq('id', partnerId)
        .eq('role', 'partner')
        .select('id, partner_commission_rate')
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error(`${LOG_PREFIX} setPartnerCommissionRate failed`, error);
      return { success: false, message: error.message };
    }
  }

  async setPartnerMinPayout(partnerId, amount) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ partner_min_payout: toNumber(amount), updated_at: new Date().toISOString() })
        .eq('id', partnerId)
        .eq('role', 'partner')
        .select('id, partner_min_payout')
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error(`${LOG_PREFIX} setPartnerMinPayout failed`, error);
      return { success: false, message: error.message };
    }
  }

  async deductPartnerBalance(partnerId, amount, reason = null) {
    try {
      const { data, error } = await supabase.rpc('admin_deduct_partner_balance', {
        p_partner_id: partnerId,
        p_amount: amount,
        p_reason: reason,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, message: data?.message || data?.error || 'Failed to deduct partner balance' };
      }
      return { success: true, message: data.message || 'Balance deducted' };
    } catch (error) {
      console.error(`${LOG_PREFIX} deductPartnerBalance failed`, error);
      return { success: false, message: error.message };
    }
  }

  async topUpPartnerBalance(partnerId, amount, reason = null) {
    const topUpAmount = toNumber(amount);
    if (!partnerId) {
      return { success: false, message: 'Partner id is required' };
    }
    if (!Number.isFinite(topUpAmount) || topUpAmount <= 0) {
      return { success: false, message: 'Top up amount must be greater than zero' };
    }

    const roundedAmount = Math.round(topUpAmount * 100) / 100;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, partner_balance')
        .eq('id', partnerId)
        .eq('role', 'partner')
        .single();
      if (profileError) throw profileError;
      if (!profile?.id) return { success: false, message: 'Partner profile not found' };

      const balanceBefore = Math.round(toNumber(profile.partner_balance, 0) * 100) / 100;
      const balanceAfter = Math.round((balanceBefore + roundedAmount) * 100) / 100;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          partner_balance: balanceAfter,
          updated_at: new Date().toISOString(),
        })
        .eq('id', partnerId)
        .eq('role', 'partner');
      if (updateError) throw updateError;

      const metadata = {
        reason: reason || null,
        source: 'admin_top_up',
      };

      const { error: txError } = await supabase
        .from('partner_balance_transactions')
        .insert({
          partner_id: partnerId,
          transaction_type: 'admin_adjustment',
          amount: roundedAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          notes: reason || null,
          metadata,
          created_by: user?.id || null,
        });

      if (txError) {
        await supabase
          .from('profiles')
          .update({
            partner_balance: balanceBefore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', partnerId)
          .eq('role', 'partner');
        throw txError;
      }

      return {
        success: true,
        message: 'Partner balance topped up',
        new_balance: balanceAfter,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} topUpPartnerBalance failed`, error);
      return { success: false, message: error.message };
    }
  }
}

const partnerFinanceService = new PartnerFinanceService();
export default partnerFinanceService;
