/**
 * Orders Service - v5 Schema
 * Implements complete state machine with dispatcher-mediated workflow
 */

import { supabase } from '../lib/supabase';
import { normalizeKyrgyzPhone as normalizeKyrgyzPhoneUtil, validateKyrgyzPhone as validateKyrgyzPhoneUtil } from '../utils/phone';

const LOG_PREFIX = '[OrdersService]';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTransientError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('econnreset')
    || message.includes('eai_again');
};

const callWithRetry = async (fn, retries = 1, delayMs = 300) => {
  let attempt = 0;
  while (attempt <= retries) {
    const result = await fn();
    if (!result?.error || !isTransientError(result.error) || attempt >= retries) {
      return result;
    }
    attempt += 1;
    await sleep(delayMs);
  }
  return fn();
};

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
  getAvailableOrders = async (page = 1, limit = 10, filters = {}) => {
    console.log(`${LOG_PREFIX} Fetching available orders (page ${page}, limit ${limit}, filters: ${JSON.stringify(filters)})...`);

    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('orders')
        .select(`
          id,
          service_type,
          urgency,
          problem_description,
          area,
          orientir,
          pricing_type,
          initial_price,
          guaranteed_payout,
          preferred_date,
          preferred_time,
          created_at
        `, { count: 'exact' })
        .in('status', [ORDER_STATUS.PLACED, ORDER_STATUS.REOPENED]);

      // Apply Filters
      if (filters.urgency && filters.urgency !== 'all') {
        query = query.eq('urgency', filters.urgency);
      }
      if (filters.service && filters.service !== 'all') {
        query = query.eq('service_type', filters.service);
      }
      if (filters.area && filters.area !== 'all') {
        query = query.eq('area', filters.area);
      }
      if (filters.pricing && filters.pricing !== 'all') {
        query = query.eq('pricing_type', filters.pricing);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error(`${LOG_PREFIX} getAvailableOrders error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Found ${data.length} available orders (Total: ${count})`);
      return { data, count };
    } catch (error) {
      console.error(`${LOG_PREFIX} getAvailableOrders failed:`, error);
      return { data: [], count: 0 };
    }
  }

  /**
   * Get metadata for ALL available orders (for filters/counts)
   */
  getAvailableOrdersMeta = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
            id,
            service_type,
            urgency,
            area,
            pricing_type
          `)
        .eq('status', ORDER_STATUS.PLACED);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getAvailableOrdersMeta failed:`, error);
      return [];
    }
  }

  /**
   * Check if master can claim order (uses unified DB function)
   * Returns detailed blockers/warnings
   */
  canClaimOrder = async (orderId) => {
    console.log(`${LOG_PREFIX} Checking if can claim order: ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('check_master_can_claim', {
        order_uuid: orderId
      });

      if (error) {
        console.error(`${LOG_PREFIX} canClaimOrder RPC error:`, error);
        return { can_claim: false, blockers: ['RPC_ERROR'] };
      }

      console.log(`${LOG_PREFIX} Claim check result:`, data);
      return data; // { can_claim, blockers, warnings, balance, threshold, immediate_count, pending_count }
    } catch (error) {
      console.error(`${LOG_PREFIX} canClaimOrder failed:`, error);
      return { can_claim: false, blockers: ['ERROR'] };
    }
  }

  /**
   * Translate blocker codes to user-friendly messages
   */
  translateBlockers = (blockers) => {
    const translations = {
      NOT_A_MASTER: 'You must be a master to claim orders',
      ORDER_NOT_AVAILABLE: 'Order is no longer available',
      NOT_VERIFIED: 'Your account is not verified',
      INACTIVE: 'Your account is inactive',
      BALANCE_BLOCKED: 'Your balance is blocked by admin',
      NEGATIVE_BALANCE: 'Your balance is zero or negative. Please top up to continue.',
      INSUFFICIENT_BALANCE: 'Insufficient prepaid balance',
      IMMEDIATE_LIMIT_REACHED: 'You have reached your immediate orders limit',
      TOO_MANY_PENDING: 'Too many orders pending confirmation',
      MAX_JOBS_REACHED: 'You have reached your maximum active jobs limit',
      ORDER_NO_LONGER_AVAILABLE: 'Order is no longer available'
    };

    if (!blockers || blockers.length === 0) return 'Cannot claim order';
    return blockers.map(b => translations[b] || b).join('. ');
  }

  /**
   * Claim order (master) - Uses unified RPC function with 8 validation checks
   */
  claimOrder = async (orderId) => {
    console.log(`${LOG_PREFIX} Claiming order: ${orderId}`);

      try {
        const { data, error } = await callWithRetry(() => supabase.rpc('claim_order', {
          order_uuid: orderId
        }));

      if (error) {
        console.error(`${LOG_PREFIX} claimOrder RPC error:`, error);
        throw error;
      }

      // Handle validation failure (can_claim = false)
      if (data.can_claim === false) {
        const blockers = data.blockers || [];
        const message = this.translateBlockers(blockers);
        console.warn(`${LOG_PREFIX} Cannot claim:`, blockers);
        return { success: false, message, blockers };
      }

      // Handle claim failure (success = false after validation passed)
      if (data.success === false) {
        const message = data.error || 'Order no longer available';
        console.warn(`${LOG_PREFIX} Claim failed:`, message);
        return { success: false, message };
      }

      console.log(`${LOG_PREFIX} Order claimed successfully`);
      return {
        success: true,
        message: 'Order claimed!',
        orderId: data.order_id,
        warnings: data.warnings || []
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} claimOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Start job (master) - Transition: claimed → started
   */
  startJob = async (orderId, masterId) => {
    console.log(`${LOG_PREFIX} Starting job: ${orderId}`);

      try {
        const { data, error } = await callWithRetry(() => supabase
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
          .single());

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
  completeJob = async (orderId, masterId, completionData) => {
    console.log(`${LOG_PREFIX} Completing job: ${orderId}`);

    try {
      const { finalPrice, workPerformed, hoursWorked, priceChangeReason } = completionData;

      if (!finalPrice || finalPrice <= 0) {
        throw new Error('Final price is required');
      }

      const { data: orderData, error: orderError } = await callWithRetry(() => supabase
        .from('orders')
        .select('callout_fee')
        .eq('id', orderId)
        .single());

      if (orderError) throw orderError;

      const calloutFee = orderData?.callout_fee;
      if (calloutFee !== null && calloutFee !== undefined && finalPrice < calloutFee) {
        throw new Error('Final price cannot be lower than call-out fee');
      }

      const { data, error } = await callWithRetry(() => supabase
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
        .single());

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
   * Uses RPC function with SECURITY DEFINER to bypass RLS
   */
  refuseJob = async (orderId, masterId, reason, notes = null) => {
    console.log(`${LOG_PREFIX} Refusing job: ${orderId}, reason: ${reason}`);

    try {
      if (!reason) {
        throw new Error('Cancellation reason is required');
      }

      const { data, error } = await callWithRetry(() => supabase.rpc('refuse_job', {
        p_order_id: orderId,
        p_master_id: masterId,
        p_reason: reason,
        p_notes: notes
      }));

      if (error) {
        console.error(`${LOG_PREFIX} refuseJob RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        console.warn(`${LOG_PREFIX} refuseJob failed:`, data.message);
        return { success: false, message: data.message };
      }

      console.log(`${LOG_PREFIX} Job refused successfully`);
      return { success: true, message: 'Job canceled. Dispatcher notified.' };
    } catch (error) {
      console.error(`${LOG_PREFIX} refuseJob failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get master's orders (claimed/started/completed)
   */
  getMasterOrders = async (masterId, page = 1, limit = 10) => {
    console.log(`${LOG_PREFIX} Fetching master orders: ${masterId} (page ${page})...`);

    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error, count } = await supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone, email),
          dispatcher:dispatcher_id(full_name, phone)
        `, { count: 'exact' })
        .eq('master_id', masterId)
        .in('status', [
          ORDER_STATUS.CLAIMED,
          ORDER_STATUS.STARTED,
          ORDER_STATUS.COMPLETED,
          ORDER_STATUS.CONFIRMED
        ])
        .order('created_at', { ascending: false })
        .range(from, to);

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

      console.log(`${LOG_PREFIX} Found ${data.length} master orders (Total: ${count})`);
      return { data: sanitized, count };
    } catch (error) {
      console.error(`${LOG_PREFIX} getMasterOrders failed:`, error);
      return { data: [], count: 0 };
    }
  }

  // ============================================
  // DISPATCHER FUNCTIONS
  // ============================================

  /**
   * Create order (dispatcher)
   */
  createOrder = async (orderData, dispatcherId) => {
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

      const parsedInitial = initialPrice !== null && initialPrice !== undefined
        ? parseFloat(initialPrice)
        : null;
      const normalizedInitial = !isNaN(parsedInitial) ? parsedInitial : null;

      if (normalizedInitial !== null && payout !== null && payout !== undefined && normalizedInitial < payout) {
        throw new Error('Initial price cannot be lower than call-out fee');
      }

      const { data, error } = await supabase
        .from('orders')
        .insert({
          client_id: clientId,
          dispatcher_id: dispatcherId,
          assigned_dispatcher_id: dispatcherId,
          pricing_type: pricingType || 'unknown',
          initial_price: normalizedInitial,
          service_type: serviceType,
          urgency: urgency || 'planned',
          problem_description: problemDescription,
          area: area,
          full_address: fullAddress,
          preferred_date: preferredDate || null,
          preferred_time: preferredTime || null,
          guaranteed_payout: payout,
          callout_fee: payout,
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
  getDispatcherOrders = async (dispatcherId, statusFilter = null) => {
    console.log(`${LOG_PREFIX} Fetching dispatcher orders: ${dispatcherId}`);

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone, email),
          master:master_id(id, full_name, phone),
          dispatcher:dispatcher_id(id, full_name, phone),
          assigned_dispatcher:assigned_dispatcher_id(id, full_name, phone)
        `)
        .or(`assigned_dispatcher_id.eq.${dispatcherId},dispatcher_id.eq.${dispatcherId}`)
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
  confirmPayment = async (orderId, dispatcherId, paymentData) => {
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
   * Update order inline (dispatcher edit)
   * Updates editable fields and creates audit log entry
   */
  updateOrderInline = async (orderId, updates) => {
    console.log(`${LOG_PREFIX} Updating order inline: ${orderId}`, updates);

    try {
      // Get current order for audit log (before update)
      const { data: oldOrder, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      // Prepare the update payload - only include non-client fields
      // Handle callout_fee: convert string to number, empty/NaN to null
      console.log(`${LOG_PREFIX} Raw callout_fee value:`, updates.callout_fee, 'type:', typeof updates.callout_fee);
      console.log(`${LOG_PREFIX} Raw initial_price value:`, updates.initial_price, 'type:', typeof updates.initial_price);

      const feeValue = updates.callout_fee !== '' && updates.callout_fee !== null && updates.callout_fee !== undefined
        ? parseFloat(updates.callout_fee)
        : null;

      const priceValue = updates.initial_price !== '' && updates.initial_price !== null && updates.initial_price !== undefined
        ? parseFloat(updates.initial_price)
        : null;

      const normalizedFee = !isNaN(feeValue) && feeValue !== null ? feeValue : null;
      const normalizedPrice = !isNaN(priceValue) && priceValue !== null ? priceValue : null;

      if (normalizedFee !== null && normalizedPrice !== null && normalizedPrice < normalizedFee) {
        throw new Error('Initial price cannot be lower than call-out fee');
      }

      const updatePayload = {
        problem_description: updates.problem_description,
        dispatcher_note: updates.dispatcher_note,
        full_address: updates.full_address,
        area: updates.area,
        orientir: updates.orientir,
        callout_fee: normalizedFee,
        initial_price: normalizedPrice,
        client_name: updates.client_name,
        client_phone: updates.client_phone,
        updated_at: new Date().toISOString()
      };

      console.log(`${LOG_PREFIX} Final updatePayload:`, JSON.stringify(updatePayload));

      // Use the database function which has SECURITY DEFINER
      // This bypasses RLS and allows dispatcher to update fee fields
      const { data: rpcResult, error: rpcError } = await supabase.rpc('update_order_inline', {
        p_order_id: orderId,
        p_updates: updatePayload
      });

      console.log(`${LOG_PREFIX} RPC result:`, rpcResult);

      if (rpcError) {
        console.error(`${LOG_PREFIX} RPC error:`, rpcError);
        throw rpcError;
      }

      if (!rpcResult?.success) {
        throw new Error(rpcResult?.error || 'Update failed');
      }

      // Fetch the updated order to return
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;

      // Create audit log entry
      try {
        await supabase.from('order_audit_log').insert({
          order_id: orderId,
          action: 'order_updated',
          old_data: oldOrder,
          new_data: data,
          performed_by: oldOrder.dispatcher_id,
          notes: 'Order edited by dispatcher'
        });
      } catch (auditErr) {
        console.warn(`${LOG_PREFIX} Audit log insert failed:`, auditErr);
        // Don't fail the whole operation if audit fails
      }

      console.log(`${LOG_PREFIX} Order updated successfully: ${orderId}`);
      return { success: true, message: 'Order updated', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updateOrderInline failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Transfer order to another dispatcher (current handler only)
   */
  transferOrderToDispatcher = async (orderId, currentDispatcherId, targetDispatcherId, callerRole = null) => {
    console.log(`${LOG_PREFIX} Transfer order ${orderId} to dispatcher ${targetDispatcherId}`);
    try {
      if (!orderId || !currentDispatcherId || !targetDispatcherId) {
        throw new Error('Missing transfer parameters');
      }
      const { data, error } = await supabase.rpc('transfer_order_to_dispatcher', {
        order_id: orderId,
        target_dispatcher_id: targetDispatcherId,
      });

      if (error) throw error;
      if (!data?.success) {
        return { success: false, message: data?.error || 'Transfer failed' };
      }

      return { success: true, order: data?.order || null };
    } catch (error) {
      console.error(`${LOG_PREFIX} transferOrderToDispatcher failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Cancel order by client (dispatcher on behalf)
   * Allowed from: placed, claimed, started, reopened
   */
  cancelByClient = async (orderId, dispatcherId, reason, callerRole = null) => {
    console.log(`${LOG_PREFIX} cancelByClient called - orderId: ${orderId}, dispatcherId: ${dispatcherId}, reason: ${reason}`);

    try {
      // First check current status
      console.log(`${LOG_PREFIX} Fetching order status...`);
      const { data: orderCheck, error: checkError } = await supabase
        .from('orders')
        .select('status, dispatcher_id')
        .eq('id', orderId)
        .single();

      console.log(`${LOG_PREFIX} Order check result:`, orderCheck, 'error:', checkError);

      if (checkError || !orderCheck) {
        console.log(`${LOG_PREFIX} Order not found or error`);
        return { success: false, message: 'Order not found' };
      }

      console.log(`${LOG_PREFIX} Order status: ${orderCheck.status}, Order dispatcher: ${orderCheck.dispatcher_id}, Current dispatcher: ${dispatcherId}`);

      if (callerRole !== 'admin' && orderCheck.dispatcher_id !== dispatcherId) {
        console.log(`${LOG_PREFIX} Dispatcher mismatch - not authorized`);
        return { success: false, message: 'Not authorized to cancel this order' };
      }

      // Check if status allows cancellation
      // Allowed: placed, canceled (to update reason), reopened, expired
      // Note: claimed and started are NOT allowed per user request
      const allowedStatuses = [
        ORDER_STATUS.PLACED,
        ORDER_STATUS.CANCELED_BY_MASTER,
        ORDER_STATUS.CANCELED_BY_CLIENT,
        ORDER_STATUS.REOPENED,
        ORDER_STATUS.EXPIRED
      ];
      console.log(`${LOG_PREFIX} Allowed statuses:`, allowedStatuses);
      console.log(`${LOG_PREFIX} Current status '${orderCheck.status}' in allowed?`, allowedStatuses.includes(orderCheck.status));

      if (!allowedStatuses.includes(orderCheck.status)) {
        console.log(`${LOG_PREFIX} Status not in allowed list`);
        return { success: false, message: `Cannot cancel order with status: ${orderCheck.status}` };
      }

      console.log(`${LOG_PREFIX} Proceeding with cancellation...`);
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CANCELED_BY_CLIENT,
          canceled_at: new Date().toISOString(),
          cancellation_reason: reason
        })
        .eq('id', orderId)
        .select()
        .single();

      console.log(`${LOG_PREFIX} Cancel update result:`, data, 'error:', error);

      if (error) throw error;
      console.log(`${LOG_PREFIX} Order canceled successfully!`);
      return { success: true, message: 'Order canceled', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} cancelByClient failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reopen order (dispatcher) - Return canceled order to pool
   */
  reopenOrder = async (orderId, dispatcherId, callerRole = null) => {
    console.log(`${LOG_PREFIX} Reopening order: ${orderId}`);

    try {
      if (callerRole === 'admin') {
        const { data, error } = await supabase.rpc('reopen_order', {
          order_uuid: orderId,
          reason: 'Reopened by admin'
        });

        if (error) throw error;
        if (!data?.success) {
          return { success: false, message: data?.message || data?.error || 'Failed to reopen order' };
        }
        return { success: true, message: 'Order reopened', order: data };
      }

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.REOPENED,
          master_id: null,
          claimed_at: null,
          started_at: null,
          canceled_at: null,
          cancellation_reason: null,
          cancellation_notes: null
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .in('status', [ORDER_STATUS.CANCELED_BY_MASTER, ORDER_STATUS.CANCELED_BY_CLIENT, ORDER_STATUS.EXPIRED])
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Order reopened', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} reopenOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unassign master (dispatcher) - Cancel then reopen to return to pool
   */
  unassignMaster = async (orderId, dispatcherId, reason = 'dispatcher_unassign', callerRole = null) => {
    console.log(`${LOG_PREFIX} Unassigning master from order: ${orderId}`);

    try {
      if (callerRole === 'admin') {
        return await this.unassignMasterAdmin(orderId, reason);
      }

      const { data: canceled, error: cancelError } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CANCELED_BY_MASTER,
          canceled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancellation_notes: 'Unassigned by dispatcher'
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .select()
        .single();

      if (cancelError) throw cancelError;

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.REOPENED,
          master_id: null,
          claimed_at: null,
          started_at: null,
          canceled_at: null,
          cancellation_reason: null,
          cancellation_notes: null
        })
        .eq('id', orderId)
        .eq('dispatcher_id', dispatcherId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Order reopened', order: data, canceled };
    } catch (error) {
      console.error(`${LOG_PREFIX} unassignMaster failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================

  /**
   * Get all orders (admin only)
   */
  getAllOrders = async () => {
    console.log(`${LOG_PREFIX} Fetching all orders (admin)...`);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone),
          master:master_id(full_name, phone),
          dispatcher:dispatcher_id(full_name),
          assigned_dispatcher:assigned_dispatcher_id(full_name)
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

  // (Admin) Order history is implemented near the end of this file to use RPCs.

  // ============================================
  // SERVICE TYPES MANAGEMENT
  // ============================================

  /**
   * Get all service types (admin)
   */
  getAllServiceTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllServiceTypes failed:`, error);
      return [];
    }
  }

  /**
   * Add service type
   */
  addServiceType = async (typeData) => {
    try {
      const { data, error } = await supabase
        .from('service_types')
        .insert(typeData)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Update service type
   */
  updateServiceType = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('service_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete service type
   */
  deleteServiceType = async (id) => {
    try {
      const { error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Check price deviation (uses DB function)
   */
  checkPriceDeviation = async (orderId) => {
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
  getPlatformStats = async () => {
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

  /**
   * Get platform settings (base price, commission)
   */
  getPlatformSettings = async () => {
    console.log(`${LOG_PREFIX} Fetching platform settings...`);
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getPlatformSettings failed:`, error);
      return { base_price: 500, commission_rate: 0.20 }; // Fallback defaults from SQL
    }
  }

  /**
   * Update platform settings
   */
  updatePlatformSettings = async (settings) => {
    console.log(`${LOG_PREFIX} Updating platform settings:`, settings);
    try {
      // Ensure we are updating the single row, assuming ID 1 or single row enforcement
      // better to use update without where if it's a single row table, but Supabase requires a WHERE clause usually.
      // Let's assume there is only one row or we grab the ID first.

      // efficient way: update all rows (since logic implies global singleton) or just id=1
      const { data, error } = await supabase
        .from('platform_settings')
        .update(settings)
        .eq('id', 1) // Assuming singleton row has ID 1
        .select()
        .single();

      if (error) throw error;
      return { success: true, settings: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updatePlatformSettings failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // DISPATCHER DASHBOARD ENHANCEMENTS
  // ============================================

  /**
   * Get active districts for forms
   */
  getDistricts = async () => {
    console.log(`${LOG_PREFIX} Fetching active districts...`);
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('id, code, name_en, name_ru, name_kg, region, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      console.log(`${LOG_PREFIX} Found ${data?.length || 0} districts`);
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getDistricts failed:`, error);
      return [];
    }
  }

  /**
   * Get all districts (admin management)
   */
  getAllDistricts = async () => {
    console.log(`${LOG_PREFIX} Fetching all districts...`);
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      console.log(`${LOG_PREFIX} Found ${data?.length || 0} districts`);
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllDistricts failed:`, error);
      return [];
    }
  }

  /**
   * Add district
   */
  addDistrict = async (districtData) => {
    try {
      const { data, error } = await supabase
        .from('districts')
        .insert(districtData)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Update district
   */
  updateDistrict = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('districts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete district
   */
  deleteDistrict = async (id) => {
    try {
      const { error } = await supabase
        .from('districts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Normalize Kyrgyz phone number to +996 format
   * Accepts: +996XXXXXXXXX, 0XXXXXXXXX, XXXXXXXXX
   * Returns: +996XXXXXXXXX or null if invalid
   */
  normalizeKyrgyzPhone = (phone) => normalizeKyrgyzPhoneUtil(phone);

  /**
   * Validate Kyrgyz phone number format
   * Returns: { valid: boolean, normalized: string|null, error: string|null }
   */
  validateKyrgyzPhone = (phone) => validateKyrgyzPhoneUtil(phone);

  /**
   * Try to find existing client by phone number
   * Returns client_id if found, null otherwise
   */
  findClientByPhone = async (clientPhone) => {
    if (!clientPhone) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .eq('phone', clientPhone)
        .eq('role', 'client')
        .maybeSingle();

      if (error) {
        console.warn(`${LOG_PREFIX} Error finding client:`, error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.warn(`${LOG_PREFIX} findClientByPhone failed:`, error);
      return null;
    }
  }

  /**
   * Create order extended (dispatcher) - Creates a new order with all fields
   * Uses client_name/client_phone columns for dispatcher-created orders
   * Client phone is used to look up existing registered clients
   */
  createOrderExtended = async (orderData, dispatcherId) => {
    console.log(`${LOG_PREFIX} Creating order (extended):`, orderData);

    try {
      if (!orderData.clientPhone) {
        throw new Error('Client phone number is required');
      }

      // Normalize phone number to +996 format
      const normalizedPhone = this.normalizeKyrgyzPhone(orderData.clientPhone);
      if (!normalizedPhone) {
        throw new Error('Invalid phone format. Use +996XXXXXXXXX, 0XXXXXXXXX, or XXXXXXXXX');
      }

      // Try to find existing registered client by normalized phone
      const existingClientId = await this.findClientByPhone(normalizedPhone);

      // Client name is validated at form level, just trim the values
      const clientName = orderData.clientName?.trim();

      if (!clientName) {
        throw new Error('Client name is required');
      }

      console.log(`${LOG_PREFIX} Order data - clientId: ${existingClientId}, clientName: ${clientName}, clientPhone: ${normalizedPhone}`);

      const parsedInitial = orderData.initialPrice !== null && orderData.initialPrice !== undefined
        ? parseFloat(orderData.initialPrice)
        : null;
      const parsedCallout = orderData.calloutFee !== null && orderData.calloutFee !== undefined
        ? parseFloat(orderData.calloutFee)
        : null;
      const normalizedInitial = !isNaN(parsedInitial) ? parsedInitial : null;
      const normalizedCallout = !isNaN(parsedCallout) ? parsedCallout : null;

      if (normalizedInitial !== null && normalizedCallout !== null && normalizedInitial < normalizedCallout) {
        throw new Error('Initial price cannot be lower than call-out fee');
      }

      const insertPayload = {
        client_id: existingClientId, // null if no registered client found
        client_name: clientName,
        client_phone: normalizedPhone,
        dispatcher_id: dispatcherId,
        assigned_dispatcher_id: dispatcherId,
        service_type: orderData.serviceType || 'other',
        urgency: orderData.urgency || 'planned',
        status: ORDER_STATUS.PLACED,
        pricing_type: orderData.pricingType || 'unknown',
        initial_price: normalizedInitial,
        callout_fee: normalizedCallout,
        problem_description: orderData.problemDescription,
        area: orderData.area,
        full_address: orderData.fullAddress,
        orientir: orderData.orientir || null,
        preferred_date: orderData.preferredDate || null,
        preferred_time: orderData.preferredTime || null,
        dispatcher_note: orderData.dispatcherNote || null,
      };

      console.log(`${LOG_PREFIX} Insert payload:`, JSON.stringify(insertPayload, null, 2));

      const { data, error } = await supabase
        .from('orders')
        .insert(insertPayload)
        .select(`
          *,
          client:client_id(full_name, phone)
        `)
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} createOrderExtended error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Order created successfully:`, data.id);
      return { success: true, orderId: data.id, order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} createOrderExtended failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
 * Get available masters for assignment (uses RPC function)
 */
  getAvailableMasters = async () => {
    console.log(`${LOG_PREFIX} Fetching available masters for assignment...`);

    try {
      const { data, error } = await supabase.rpc('get_available_masters');

      if (error) {
        console.error(`${LOG_PREFIX} getAvailableMasters RPC error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Found ${data?.length || 0} available masters`);
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getAvailableMasters failed:`, error);
      return [];
    }
  }

  /**
   * Force assign master to order (dispatcher/admin only)
   */
  forceAssignMaster = async (orderId, masterId, reason = 'Dispatcher assignment') => {
    console.log(`${LOG_PREFIX} Force assigning master ${masterId} to order ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('force_assign_master', {
        p_order_id: orderId,
        p_master_id: masterId,
        p_reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} forceAssignMaster RPC error:`, error);
        throw error;
      }

      if (!data || !data.success) {
        const errorCode = data?.error || 'UNKNOWN';
        console.warn(`${LOG_PREFIX} forceAssignMaster failed:`, data?.message || errorCode);
        return { success: false, message: data?.message, error: errorCode };
      }

      console.log(`${LOG_PREFIX} Master assigned successfully:`, data);
      return { success: true, message: 'Master assigned!', ...data };
    } catch (error) {
      console.error(`${LOG_PREFIX} forceAssignMaster failed:`, error);
      const message = error?.message || '';
      const normalized = message.toLowerCase();
      let errorCode = 'UNKNOWN';
      if (normalized.includes('unauthorized')) errorCode = 'UNAUTHORIZED';
      if (normalized.includes('order not found')) errorCode = 'ORDER_NOT_FOUND';
      if (normalized.includes('master not found')) errorCode = 'MASTER_NOT_FOUND';
      return { success: false, message: error?.message, error: errorCode };
    }
  }

  /**
   * Confirm payment (admin) - Transition: completed -> confirmed
   */
  confirmPaymentAdmin = async (orderId, paymentMethod = 'cash', paymentProofUrl = null) => {
    console.log(`${LOG_PREFIX} Admin confirming payment for order: ${orderId}`);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const adminId = authData?.user?.id;
      if (!adminId) {
        throw new Error('Unauthorized');
      }

      const confirmedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CONFIRMED,
          confirmed_at: confirmedAt,
          payment_method: paymentMethod,
          payment_proof_url: paymentProofUrl || null,
          payment_confirmed_by: adminId,
          payment_confirmed_at: confirmedAt,
        })
        .eq('id', orderId)
        .eq('status', ORDER_STATUS.COMPLETED)
        .select()
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} confirmPaymentAdmin error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Admin payment confirmed for order:`, data?.id);
      return { success: true, message: 'Payment confirmed!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} confirmPaymentAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Admin override final price (updates commission + ledger)
   */
  overrideFinalPriceAdmin = async (orderId, finalPrice, reason = 'admin_price_override') => {
    console.log(`${LOG_PREFIX} Admin overriding final price for order: ${orderId}`, finalPrice);

    try {
      const { data, error } = await supabase.rpc('admin_override_final_price', {
        p_order_id: orderId,
        p_final_price: finalPrice,
        p_reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} overrideFinalPriceAdmin error:`, error);
        throw error;
      }

      if (!data?.success) {
        return { success: false, message: data?.message || data?.error || 'Override failed' };
      }

      return { success: true, order: data?.order || null };
    } catch (error) {
      console.error(`${LOG_PREFIX} overrideFinalPriceAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // NOTE: updateOrderInline is defined earlier in the file (around line 531)
  // with proper fee handling and debug logging

  /**
   * Confirm payment (dispatcher) - Transition: completed → confirmed
   * Called after client pays the master for completed work
   */
  confirmPayment = async (orderId, dispatcherId, paymentDetails) => {
    console.log(`${LOG_PREFIX} Confirming payment for order: ${orderId}`);

    try {
      const { paymentMethod, paymentProofUrl } = paymentDetails;

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CONFIRMED,
          confirmed_at: new Date().toISOString(),
          payment_method: paymentMethod || 'cash',
          payment_proof_url: paymentProofUrl || null,
        })
        .eq('id', orderId)
        .eq('status', ORDER_STATUS.COMPLETED)
        .select()
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} confirmPayment error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Payment confirmed for order:`, data.id);
      return { success: true, message: 'Payment confirmed!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} confirmPayment failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get all dispatcher orders with advanced filtering
   * Enhanced version for the new dashboard
   */
  getDispatcherOrdersAdvanced = async (dispatcherId, options = {}) => {
    console.log(`${LOG_PREFIX} Fetching dispatcher orders with advanced filters:`, options);

    try {
      const { statusFilter, search, urgency, serviceType, sortOrder = 'desc' } = options;

      let query = supabase
        .from('orders')
        .select(`
          *,
          client:client_id(id, full_name, phone, email),
          master:master_id(id, full_name, phone, rating, total_commission_owed),
          dispatcher:dispatcher_id(id, full_name, phone),
          assigned_dispatcher:assigned_dispatcher_id(id, full_name, phone)
        `)
        .or(`assigned_dispatcher_id.eq.${dispatcherId},dispatcher_id.eq.${dispatcherId}`);

      // Status filter (multiple allowed)
      if (statusFilter && statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }

      // Urgency filter
      if (urgency && urgency !== 'all') {
        query = query.eq('urgency', urgency);
      }

      // Service type filter
      if (serviceType && serviceType !== 'all') {
        query = query.eq('service_type', serviceType);
      }

      // Sort order
      query = query.order('created_at', { ascending: sortOrder === 'asc' });

      const { data, error } = await query;
      if (error) throw error;

      // Client-side search (for flexibility)
      let results = data || [];
      if (search) {
        const q = search.toLowerCase();
        results = results.filter(o =>
          o.id.toLowerCase().includes(q) ||
          o.client?.full_name?.toLowerCase().includes(q) ||
          o.client?.phone?.includes(q) ||
          o.full_address?.toLowerCase().includes(q) ||
          o.master?.full_name?.toLowerCase().includes(q) ||
          o.problem_description?.toLowerCase().includes(q)
        );
      }

      console.log(`${LOG_PREFIX} Found ${results.length} orders with filters`);
      return results;
    } catch (error) {
      console.error(`${LOG_PREFIX} getDispatcherOrdersAdvanced failed:`, error);
      return [];
    }
  }

  // ============================================
  // ENHANCED STATS FOR V5 DASHBOARD
  // ============================================

  /**
   * Get enhanced platform stats with date filtering and chart data
   * @param {Object} dateFilter - { type: 'all'|'today'|'week'|'month'|'custom', start?, end? }
   */
  getEnhancedPlatformStats = async (dateFilter = { type: 'all' }) => {
    console.log(`${LOG_PREFIX} Fetching enhanced platform stats with filter:`, dateFilter);

    try {
      // Build date range query
      let query = supabase
        .from('orders')
        .select('id, status, final_price, service_type, created_at, confirmed_at');

      // Apply date filters based on confirmed_at for revenue, created_at for counts
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

      const { data: orders, error } = await query;
      if (error) throw error;

      // Basic counts
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

      // Revenue data for last 7 days bar chart
      const revenueData = Array(7).fill(0);
      const now = new Date();
      const confirmedOrders = orders.filter(o => o.status === ORDER_STATUS.CONFIRMED && o.confirmed_at);

      confirmedOrders.forEach(order => {
        const orderDate = new Date(order.confirmed_at);
        const daysDiff = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
        if (daysDiff >= 0 && daysDiff < 7) {
          revenueData[6 - daysDiff] += Number(order.final_price) || 0;
        }
      });

      stats.revenueData = revenueData;

      // Service breakdown
      const serviceCount = {};
      orders.forEach(o => {
        const service = o.service_type || 'other';
        serviceCount[service] = (serviceCount[service] || 0) + 1;
      });

      stats.serviceBreakdown = Object.entries(serviceCount)
        .map(([name, count]) => ({
          name,
          count,
          percentage: orders.length > 0 ? Math.round((count / orders.length) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 services

      // Status breakdown
      const statusCount = {};
      orders.forEach(o => {
        const status = o.status;
        statusCount[status] = (statusCount[status] || 0) + 1;
      });

      stats.statusBreakdown = Object.entries(statusCount)
        .map(([status, count]) => ({ status, count }))
        .filter(item => item.count > 0); // Only non-zero statuses

      console.log(`${LOG_PREFIX} Enhanced stats calculated:`, stats);
      return stats;
    } catch (error) {
      console.error(`${LOG_PREFIX} getEnhancedPlatformStats failed:`, error);
      return {
        totalOrders: 0,
        activeJobs: 0,
        completedOrders: 0,
        confirmedOrders: 0,
        totalRevenue: 0,
        revenueData: [0, 0, 0, 0, 0, 0, 0],
        serviceBreakdown: [],
        statusBreakdown: []
      };
    }
  }

  /**
   * Get orders by specific statuses (for detail modals)
   * @param {Array} statuses - Array of status strings
   * @param {Object} dateFilter - Optional date filter
   */
  getOrdersByStatus = async (statuses = [], dateFilter = { type: 'all' }) => {
    console.log(`${LOG_PREFIX} Fetching orders by statuses:`, statuses);

    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          client:client_id(full_name, phone),
          master:master_id(full_name, phone),
          dispatcher:dispatcher_id(full_name)
        `);

      if (statuses.length > 0) {
        query = query.in('status', statuses);
      }

      // Apply date filters
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

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      console.log(`${LOG_PREFIX} Found ${data.length} orders matching statuses`);
      return data;
    } catch (error) {
      console.error(`${LOG_PREFIX} getOrdersByStatus failed:`, error);
      return [];
    }
  }

  /**
   * CRUD operations for admin
  
   */
  updateOrder = async (orderId, updates) => {
    console.log(`${LOG_PREFIX} Updating order (admin): ${orderId}`, updates);

    try {
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      console.log(`${LOG_PREFIX} Order updated successfully`);
      return { success: true, message: 'Order updated!', order: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updateOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  deleteOrder = async (orderId) => {
    console.log(`${LOG_PREFIX} Deleting order (admin): ${orderId}`);

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      console.log(`${LOG_PREFIX} Order deleted successfully`);
      return { success: true, message: 'Order deleted!' };
    } catch (error) {
      console.error(`${LOG_PREFIX} deleteOrder failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get all orders for Admin
   */
  getAllOrders = async () => {
    console.log(`${LOG_PREFIX} Fetching ALL orders for Admin`);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
                *,
                client:client_id(full_name, phone),
                master:master_id(full_name, phone),
                dispatcher:dispatcher_id(full_name),
                assigned_dispatcher:assigned_dispatcher_id(id, full_name, phone)
              `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('getAllOrders failed', e);
      return [];
    }
  }

  /**
   * Confirm payment for a completed order (Dispatcher action)
   * Transitions order from 'completed' to 'confirmed'
   */
  confirmPayment = async (orderId, dispatcherId, paymentDetails) => {
    console.log(`${LOG_PREFIX} Confirming payment for order: ${orderId}`);

    try {
      const { paymentMethod, paymentProofUrl } = paymentDetails;

      // Update order status to confirmed and record payment details
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CONFIRMED,
          payment_method: paymentMethod,
          payment_proof_url: paymentProofUrl,
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: dispatcherId,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('status', ORDER_STATUS.COMPLETED) // Only confirm if status is completed
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return { success: false, message: 'Order not in completed status or not found' };
      }

      console.log(`${LOG_PREFIX} Payment confirmed successfully for order ${orderId}`);
      return { success: true, message: 'Payment confirmed!', data };
    } catch (error) {
      console.error(`${LOG_PREFIX} confirmPayment failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // ============================================
  // V2 SCHEMA: LOOKUP TABLES & HISTORY
  // ============================================

  /**
   * Get active service types from database
   * Returns admin-configurable service types for dropdowns
   */
  getServiceTypes = async () => {
    console.log(`${LOG_PREFIX} Fetching active service types...`);
    try {
      const { data, error } = await supabase
        .from('service_types')
        .select('code, name_en, name_ru, name_kg')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getServiceTypes failed:`, error);
      return [];
    }
  }

  /**
   * Get cancellation reasons from database
   * @param {string} applicableTo - 'master', 'client', or 'both'
   */
  getCancellationReasons = async (applicableTo = 'master') => {
    console.log(`${LOG_PREFIX} Fetching cancellation reasons for: ${applicableTo}`);
    try {
      const { data, error } = await supabase
        .from('cancellation_reasons')
        .select('*')
        .or(`applicable_to.eq.${applicableTo},applicable_to.eq.both`)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getCancellationReasons failed:`, error);
      return [];
    }
  }

  /**
   * Get all cancellation reasons (admin management)
   */
  getAllCancellationReasons = async () => {
    console.log(`${LOG_PREFIX} Fetching all cancellation reasons...`);
    try {
      const { data, error } = await supabase
        .from('cancellation_reasons')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getAllCancellationReasons failed:`, error);
      return [];
    }
  }

  /**
   * Add cancellation reason
   */
  addCancellationReason = async (reasonData) => {
    try {
      const { data, error } = await supabase
        .from('cancellation_reasons')
        .insert(reasonData)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Update cancellation reason
   */
  updateCancellationReason = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('cancellation_reasons')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Delete cancellation reason
   */
  deleteCancellationReason = async (id) => {
    try {
      const { error } = await supabase
        .from('cancellation_reasons')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get complete order history for master (admin view)
   * Includes orders where the master touched the order (audit log),
   * even if the master_id was later cleared.
   */
  getMasterOrderHistory = async (masterId, limit = 100) => {
    console.log(`${LOG_PREFIX} Fetching complete order history for master: ${masterId}`);
    try {
      const { data, error } = await supabase.rpc('get_master_order_history_admin', {
        master_uuid: masterId,
        limit_count: limit
      });

      if (error) throw error;

      return (data || []).map(row => ({
        ...row,
        client: row.client_name ? { full_name: row.client_name } : null
      }));
    } catch (error) {
      console.error(`${LOG_PREFIX} getMasterOrderHistory failed:`, error);
      return [];
    }
  }

  /**
   * Get complete order history for dispatcher (admin view)
   * Includes orders created or handled by this dispatcher.
   */
  getDispatcherOrderHistory = async (dispatcherId, limit = 100) => {
    console.log(`${LOG_PREFIX} Fetching complete order history for dispatcher: ${dispatcherId}`);
    try {
      const { data, error } = await supabase.rpc('get_dispatcher_order_history_admin', {
        dispatcher_uuid: dispatcherId,
        limit_count: limit
      });

      if (error) throw error;

      return (data || []).map(row => ({
        ...row,
        client: row.client_name ? { full_name: row.client_name } : null,
        master: row.master_name ? { full_name: row.master_name } : null
      }));
    } catch (error) {
      console.error(`${LOG_PREFIX} getDispatcherOrderHistory failed:`, error);
      return [];
    }
  }

  // ============================================
  // PLATFORM SETTINGS
  // ============================================

  /**
   * Get platform settings (admin-configurable)
   * Returns the singleton settings row from platform_settings table
   */
  getPlatformSettings = async () => {
    console.log(`${LOG_PREFIX} Fetching platform settings...`);
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;

      // Map to friendly names for UI
      return {
        base_price: data.default_guaranteed_payout || 500,
        commission_rate: Math.round((data.commission_rate || 0.15) * 100),
        min_balance: data.min_balance_for_orders || 1000,
        order_expiry_hours: data.order_expiry_hours || 24,
        max_immediate_orders: data.default_max_immediate_orders || 2,
        max_pending_confirmation: data.default_max_pending_confirmation || 5,
        price_deviation_threshold: Math.round((data.price_deviation_threshold || 0.25) * 100),
        commission_exempt_base_fee: data.commission_exempt_base_fee || false,
        ...data // Include all raw fields too
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} getPlatformSettings failed:`, error);
      return {
        base_price: 500,
        commission_rate: 15,
        min_balance: 1000,
        order_expiry_hours: 24
      };
    }
  }

  // ============================================
  // ADMIN-ONLY FUNCTIONS (Missing DB Wrappers)
  // ============================================

  /**
   * Reopen order (admin) - Reopen canceled/expired orders for re-assignment
   * Uses reopen_order RPC function from COMPLETE_SETUP_V2.sql
   */
  reopenOrderAdmin = async (orderId, reason = 'Reopened by admin') => {
    console.log(`${LOG_PREFIX} Admin reopening order: ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('reopen_order_admin', {
        order_uuid: orderId,
        reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} reopenOrderAdmin RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        return { success: false, message: data.message || data.error };
      }

      console.log(`${LOG_PREFIX} Order reopened successfully:`, data);
      return { success: true, message: 'Order reopened', orderId: data.order_id, previousStatus: data.previous_status };
    } catch (error) {
      console.error(`${LOG_PREFIX} reopenOrderAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Expire old orders (admin/scheduler) - Manually trigger order expiry
   * Uses expire_old_orders RPC function from COMPLETE_SETUP_V2.sql
   */
  expireOldOrders = async () => {
    console.log(`${LOG_PREFIX} Triggering order expiry...`);

    try {
      const { data, error } = await supabase.rpc('expire_old_orders');

      if (error) {
        console.error(`${LOG_PREFIX} expireOldOrders RPC error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Expired ${data} orders`);
      return { success: true, message: `Expired ${data} orders`, expiredCount: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} expireOldOrders failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Force assign master to order (admin) - Bypasses normal claiming flow
   * Uses force_assign_master RPC function from COMPLETE_SETUP_V2.sql
   */
  forceAssignMasterAdmin = async (orderId, masterId, reason = 'Admin assignment') => {
    console.log(`${LOG_PREFIX} Admin force assigning master ${masterId} to order ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('force_assign_master', {
        p_order_id: orderId,
        p_master_id: masterId,
        p_reason: reason
      });

      if (error) {
        console.error(`${LOG_PREFIX} forceAssignMasterAdmin RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        return { success: false, message: data.error || 'Assignment failed' };
      }

      console.log(`${LOG_PREFIX} Master force assigned:`, data);
      return { success: true, message: `Assigned to ${data.master_name}`, orderId: data.order_id, masterName: data.master_name };
    } catch (error) {
      console.error(`${LOG_PREFIX} forceAssignMasterAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Unassign master (admin) - Cancel then reopen to return to pool
   */
  unassignMasterAdmin = async (orderId, reason = 'admin_unassign') => {
    console.log(`${LOG_PREFIX} Admin unassigning master from order: ${orderId}`);

    try {
      const { data: canceled, error: cancelError } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.CANCELED_BY_MASTER,
          canceled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancellation_notes: 'Unassigned by admin'
        })
        .eq('id', orderId)
        .select()
        .single();

      if (cancelError) throw cancelError;

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: ORDER_STATUS.REOPENED,
          master_id: null,
          claimed_at: null,
          started_at: null,
          canceled_at: null,
          cancellation_reason: null,
          cancellation_notes: null
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, message: 'Order reopened', order: data, canceled };
    } catch (error) {
      console.error(`${LOG_PREFIX} unassignMasterAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Cancel order (admin)
   */
  cancelOrderAdmin = async (orderId, reason = 'admin_cancel') => {
    console.log(`${LOG_PREFIX} Admin canceling order: ${orderId}`);

    try {
      const { data, error } = await supabase.rpc('cancel_order_admin', {
        order_uuid: orderId,
        reason
      });

      if (error) throw error;
      if (!data?.success) {
        return { success: false, message: data?.message || data?.error || 'Order cancel failed' };
      }
      return { success: true, message: 'Order canceled', orderId: data?.order_id, previousStatus: data?.previous_status };
    } catch (error) {
      console.error(`${LOG_PREFIX} cancelOrderAdmin failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Verify payment proof (admin/dispatcher) - Verify transfer payment proof
   * Uses verify_payment_proof RPC function from COMPLETE_SETUP_V2.sql
   */
  verifyPaymentProof = async (orderId, isValid, notes = null) => {
    console.log(`${LOG_PREFIX} Verifying payment proof for order ${orderId}: ${isValid}`);

    try {
      const { data, error } = await supabase.rpc('verify_payment_proof', {
        order_uuid: orderId,
        is_valid: isValid,
        notes: notes
      });

      if (error) {
        console.error(`${LOG_PREFIX} verifyPaymentProof RPC error:`, error);
        throw error;
      }

      if (!data.success) {
        return { success: false, message: data.error || 'Verification failed' };
      }

      console.log(`${LOG_PREFIX} Payment proof verified:`, data);
      return { success: true, message: isValid ? 'Payment proof verified' : 'Payment proof rejected', verified: data.verified };
    } catch (error) {
      console.error(`${LOG_PREFIX} verifyPaymentProof failed:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get order volume by area (admin) - Analytics function
   * Uses get_order_volume_by_area RPC function from COMPLETE_SETUP_V2.sql
   */
  getOrderVolumeByArea = async (startDate = null, endDate = null) => {
    console.log(`${LOG_PREFIX} Fetching order volume by area...`);

    try {
      const params = {};
      if (startDate) params.p_start_date = new Date(startDate).toISOString();
      if (endDate) params.p_end_date = new Date(endDate).toISOString();

      const { data, error } = await supabase.rpc('get_order_volume_by_area', params);

      if (error) {
        console.error(`${LOG_PREFIX} getOrderVolumeByArea RPC error:`, error);
        throw error;
      }

      console.log(`${LOG_PREFIX} Order volume data:`, data?.length || 0, 'records');
      return data || [];
    } catch (error) {
      console.error(`${LOG_PREFIX} getOrderVolumeByArea failed:`, error);
      return [];
    }
  }

  /**
   * Update platform settings (admin only)
   */
  updatePlatformSettings = async (settings) => {
    console.log(`${LOG_PREFIX} Updating platform settings:`, settings);

    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .update(settings)
        .eq('id', 1)
        .select()
        .single();

      if (error) throw error;

      console.log(`${LOG_PREFIX} Settings updated successfully`);
      return { success: true, message: 'Settings updated', settings: data };
    } catch (error) {
      console.error(`${LOG_PREFIX} updatePlatformSettings failed:`, error);
      return { success: false, message: error.message };
    }
  }
}
const ordersService = new OrdersService();
export default ordersService;
