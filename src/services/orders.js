/**
 * Orders Service - v5 Schema
 * Implements complete state machine with dispatcher-mediated workflow
 */

import { supabase } from '../lib/supabase';

const LOG_PREFIX = '[OrdersService]';

// Order status constants
export const ORDER_STATUS = {
  PLACED: 'placed',
  CLAIMED: 'claimed',
  STARTED: 'started',
  COMPLETED: 'completed',
  CONFIRMED: 'confirmed',
  CANCELED_BY_MASTER: 'canceled_by_master',
  CANCELED_BY_CLIENT: 'canceled_by_client',
  REOPENED: 'reopened',
  EXPIRED: 'expired',
};

// Cancellation reasons enum
export const CANCEL_REASONS = {
  SCOPE_MISMATCH: 'scope_mismatch',
  CLIENT_UNAVAILABLE: 'client_unavailable',
  SAFETY_RISK: 'safety_risk',
  TOOLS_MISSING: 'tools_missing',
  MATERIALS_UNAVAILABLE: 'materials_unavailable',
  ADDRESS_UNREACHABLE: 'address_unreachable',
  OTHER: 'other',
};

class OrdersService {
  // ============================================
  // MASTER FUNCTIONS
  // ============================================

  /**
   * Get available orders (pool view for masters)
   * Returns orders with STAGED visibility - no full_address before claim
   */
  async getAvailableOrders() {
    console.log(`${LOG_PREFIX} Fetching available orders...`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          service_type,
          urgency,
          problem_description,
          area,
          pricing_type,
          initial_price,
          guaranteed_payout,
          preferred_date,
          preferred_time,
          created_at
        `)
        .eq('status', ORDER_STATUS.PLACED)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`${LOG_PREFIX} getAvailableOrders error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Found ${data.length} available orders`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAvailableOrders failed:`, error);
      return [];
    }
  }

  /**
   * Check if master can claim order (uses DB function)
   */
  async canClaimOrder(orderId) {
    console.log(`${LOG_PREFIX} Checking if can claim order: ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('can_claim_order', {
        order_uuid: orderId
      });

      if (error) {
        console.error(`${LOG_PREFIX} canClaimOrder RPC error:`, error);
        return false;
      }

      console.log(`${LOG_PREFIX} Can claim: ${data}`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} canClaimOrder failed:`, error);
      return false;
    }
  }

  /**
   * Claim order (master) - Uses optimistic locking
   */
  async claimOrder(orderId, masterId) {
    console.log(`${LOG_PREFIX} Claiming order: ${orderId} for master: ${masterId}`);

    try {
      // First check eligibility
      const canClaim = await this.canClaimOrder(orderId);
      if (!canClaim) {
        return {
          success: false,
          message: 'Cannot claim: either not verified, at job limit, or order unavailable'
        };
      }

      // Atomic claim with optimistic locking
      const { data, error } = await supabase
        .from('orders')
        .update({
          master_id: masterId,
          status: ORDER_STATUS.CLAIMED,
          claimed_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('status', ORDER_STATUS.PLACED)
        .is('master_id', null)
        .select(`
          *,
          client:client_id(full_name, phone)
        `)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`${LOG_PREFIX} Order already claimed by another master`);
          return { success: false, message: 'Order no longer available' };
        }
        throw error;
      }

      console.log(`${LOG_PREFIX} Order claimed successfully`);
      return { success: true, message: 'Order claimed!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} claimOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Start job (master) - Transition: claimed → started
   */
  async startJob(orderId, masterId) {
    console.log(`${LOG_PREFIX} Starting job: ${orderId}`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.STARTED,
          started_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('master_id', masterId)
        .eq('status', ORDER_STATUS.CLAIMED)
        .select(`
          *,
          client:client_id(full_name, phone, email)
        `)
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} startJob error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Job started successfully`);
      return { success: true, message: 'Job started!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} startJob failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Complete job (master) - Submit final price and work details
   */
  async completeJob(orderId, masterId, completionData) {
    console.log(`${LOG_PREFIX} Completing job: ${orderId}`);

    try {
      const { finalPrice, workPerformed, hoursWorked, priceChangeReason } = completionData;

      if (!finalPrice || finalPrice <= 0) {
        throw new Error('Final price is required');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.COMPLETED,
          completed_at: new Date().toISOString(),
          final_price: finalPrice,
          work_performed: workPerformed,
          hours_worked: hoursWorked,
          price_change_reason: priceChangeReason || null
        })
        .eq('id', orderId)
        .eq('master_id', masterId)
        .eq('status', ORDER_STATUS.STARTED)
        .select()
        .single();

      if (error) throw error;

      // Check price deviation
      const deviation = await this.checkPriceDeviation(orderId);

      console.log(`${LOG_PREFIX} Job completed. Deviation check:`, deviation);

      return {
        success: true,
        message: 'Job completed! Awaiting confirmation.',
        order: data,
        requiresReview: deviation?.requires_review || false
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} completeJob failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Refuse job (master) - Cancel with mandatory reason
   */
  async refuseJob(orderId, masterId, reason, notes = null) {
    console.log(`${LOG_PREFIX} Refusing job: ${orderId}, reason: ${reason}`);

    try {
      if (!reason) {
        throw new Error('Cancellation reason is required');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CANCELED_BY_MASTER,
          canceled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancellation_notes: notes
        })
        .eq('id', orderId)
        .eq('master_id', masterId)
        .eq('status', ORDER_STATUS.STARTED)
        .select()
        .single();

      if (error) throw error;

      console.log(`${LOG_PREFIX} Job refused successfully`);
      return { success: true, message: 'Job canceled. Dispatcher notified.', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} refuseJob failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get master's orders (claimed/started/completed)
   */
  async getMasterOrders(masterId) {
    console.log(`${LOG_PREFIX} Fetching master orders: ${masterId}`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone, email)
        `)
        .eq('master_id', masterId)
        .in('status', [
          ORDER_STATUS.CLAIMED,
          ORDER_STATUS.STARTED,
          ORDER_STATUS.COMPLETED,
          ORDER_STATUS.CONFIRMED
        ])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Hide sensitive info for confirmed orders
      const sanitized = data.map(order => {
        if (order.status === ORDER_STATUS.CONFIRMED) {
          return {
            ...order,
            full_address: '***hidden***',
            client: {
              ...order.client,
              phone: '***hidden***',
              email: '***hidden***'
            }
          };
        }
        return order;
      });

      console.log(`${LOG_PREFIX} Found ${data.length} master orders`);
      return sanitized;
    } catch (error) {
      console.error(`${LOG_PREFIX} getMasterOrders failed:`, error);
      return [];
    }
  }

  // ============================================
  // DISPATCHER FUNCTIONS
  // ============================================

  /**
   * Create order (dispatcher)
   */
  async createOrder(orderData, dispatcherId) {
    console.log(`${LOG_PREFIX} Creating order by dispatcher: ${dispatcherId}`);

    try {
      const {
        clientId,
        pricingType,
        initialPrice,
        serviceType,
        urgency,
        problemDescription,
        area,
        fullAddress,
        preferredDate,
        preferredTime,
        guaranteedPayout
      } = orderData;

      // Get default guaranteed payout if not specified
      let payout = guaranteedPayout;
      if (!payout) {
        const { data: settings } = await supabase
          .from('platform_settings')
          .select('default_guaranteed_payout')
          .single();
        payout = settings?.default_guaranteed_payout || 500;
      }

      const { data, error } = await supabase
        .from('orders')
        .insert({
          client_id: clientId,
          dispatcher_id: dispatcherId,
          pricing_type: pricingType || 'unknown',
          initial_price: initialPrice || null,
          service_type: serviceType,
          urgency: urgency || 'planned',
          problem_description: problemDescription,
          area: area,
          full_address: fullAddress,
          preferred_date: preferredDate || null,
          preferred_time: preferredTime || null,
          guaranteed_payout: payout,
          status: ORDER_STATUS.PLACED
        })
        .select(`
          *,
          client:client_id(full_name, phone)
        `)
        .single();

      if (error) throw error;

      console.log(`${LOG_PREFIX} Order created: ${data.id}`);
      return { success: true, message: 'Order created!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} createOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get dispatcher's orders
   */
  async getDispatcherOrders(dispatcherId, statusFilter = null) {
    console.log(`${LOG_PREFIX} Fetching dispatcher orders: ${dispatcherId}`);

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone, email),
          master:master_id(full_name, phone)
        `)
        .eq('dispatcher_id', dispatcherId)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      console.log(`${LOG_PREFIX} Found ${data.length} dispatcher orders`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getDispatcherOrders failed:`, error);
      return [];
    }
  }

  /**
   * Confirm payment (dispatcher) - Final closure
   */
  async confirmPayment(orderId, dispatcherId, paymentData) {
    console.log(`${LOG_PREFIX} Confirming payment for order: ${orderId}`);

    try {
      const { paymentMethod, paymentProofUrl } = paymentData;

      if (!paymentMethod) {
        throw new Error('Payment method is required');
      }

      if (paymentMethod === 'transfer' && !paymentProofUrl) {
        throw new Error('Proof required for bank transfers');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CONFIRMED,
          confirmed_at: new Date().toISOString(),
          payment_method: paymentMethod,
          payment_proof_url: paymentProofUrl || null,
          payment_confirmed_by: dispatcherId
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .eq('status', ORDER_STATUS.COMPLETED)
        .select()
        .single();

      if (error) throw error;

      console.log(`${LOG_PREFIX} Payment confirmed for order: ${orderId}`);
      return { success: true, message: 'Payment confirmed!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} confirmPayment failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Cancel order by client (dispatcher on behalf)
   */
  async cancelByClient(orderId, dispatcherId, reason) {
    console.log(`${LOG_PREFIX} Canceling order by client: ${orderId}`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CANCELED_BY_CLIENT,
          canceled_at: new Date().toISOString(),
          cancellation_reason: reason
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .in('status', [ORDER_STATUS.PLACED, ORDER_STATUS.CLAIMED])
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Order canceled', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} cancelByClient failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reopen order (dispatcher) - Return canceled order to pool
   */
  async reopenOrder(orderId, dispatcherId) {
    console.log(`${LOG_PREFIX} Reopening order: ${orderId}`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.PLACED,
          master_id: null,
          claimed_at: null,
          started_at: null,
          canceled_at: null,
          cancellation_reason: null,
          cancellation_notes: null
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .in('status', [ORDER_STATUS.CANCELED_BY_MASTER, ORDER_STATUS.CANCELED_BY_CLIENT])
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Order reopened', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} reopenOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================

  /**
   * Get all orders (admin only)
   */
  async getAllOrders() {
    console.log(`${LOG_PREFIX} Fetching all orders (admin)...`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone),
          master:master_id(full_name, phone),
          dispatcher:dispatcher_id(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log(`${LOG_PREFIX} Found ${data.length} total orders`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllOrders failed:`, error);
      return [];
    }
  }

  /**
   * Check price deviation (uses DB function)
   */
  async checkPriceDeviation(orderId) {
    try {
      const { data, error } = await supabase.rpc('check_price_deviation', {
        order_uuid: orderId
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} checkPriceDeviation failed:`, error);
      return { requires_review: false };
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats() {
    console.log(`${LOG_PREFIX} Fetching platform stats...`);

    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('status, final_price');

      if (error) throw error;

      const stats = {
        totalOrders: orders.length,
        placedOrders: orders.filter(o => o.status === ORDER_STATUS.PLACED).length,
        activeJobs: orders.filter(o => [ORDER_STATUS.CLAIMED, ORDER_STATUS.STARTED].includes(o.status)).length,
        completedOrders: orders.filter(o => o.status === ORDER_STATUS.COMPLETED).length,
        confirmedOrders: orders.filter(o => o.status === ORDER_STATUS.CONFIRMED).length,
        totalRevenue: orders
          .filter(o => o.status === ORDER_STATUS.CONFIRMED)
          .reduce((sum, o) => sum + (Number(o.final_price) || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error(`${LOG_PREFIX} getPlatformStats failed:`, error);
      return {};
    }
  }
}

const ordersService = new OrdersService();
export default ordersService;