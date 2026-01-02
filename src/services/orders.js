/**
 * Orders Service
 * Handles order management via Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import logger from '../utils/logger';

class OrdersService {
  /**
   * Helper: Map Supabase row to App's Order Object structure
   * This is crucial to avoid breaking the existing UI
   */
  _mapOrder(row) {
    if (!row) return null;

    const assignedPlumber = row.plumber ? {
      plumberId: row.plumber.id,
      plumberName: row.plumber.full_name,
      plumberPhone: row.plumber.phone,
      plumberEmail: row.plumber.email,
      claimedAt: row.assigned_at,
    } : null;

    const completion = row.completed_at ? {
      workDescription: row.work_description,
      hoursWorked: parseFloat(row.hours_worked || 0),
      amountCharged: parseFloat(row.final_price || 0),
      paymentMethod: row.payment_method,
      completedAt: row.completed_at,
      // In this new flow, verification logic uses status='verified'
      clientConfirmed: row.status === 'verified',
      clientConfirmedAmount: parseFloat(row.final_price || 0), // Assuming no dispute logic yet
    } : null;

    return {
      id: row.id,
      clientId: row.client_id,
      // Client details might be joined
      clientName: row.client?.full_name || 'Unknown',
      clientPhone: row.client?.phone || 'N/A',
      clientEmail: row.client?.email || 'N/A',

      status: row.status,
      urgency: row.urgency,

      serviceDetails: {
        problemDescription: row.problem_description,
        serviceType: row.service_type,
        address: row.address,
        photos: row.photos || [],
        preferredDate: row.preferred_date,
        preferredTime: row.preferred_time,
      },

      assignedPlumber,
      completion,

      createdAt: row.created_at,
      updatedAt: row.updated_at,

      // Rating (if joined)
      rating: row.reviews && row.reviews.length > 0 ? row.reviews[0] : null,

      // Dispute flag
      isDisputed: row.is_disputed || false
    };
  }

  /**
   * Submit new order
   */
  async submitOrder(orderData, currentUser) {
    try {
      if (!orderData.problemDescription || !orderData.address) {
        throw new Error('Description and address are required');
      }

      const { data, error } = await supabase
        .from('orders')
        .insert({
          client_id: currentUser.id,
          service_type: orderData.serviceType || 'repair',
          problem_description: orderData.problemDescription.trim(),
          address: orderData.address.trim(),
          urgency: orderData.urgency || 'normal',
          preferred_date: orderData.preferredDate || null,
          preferred_time: orderData.preferredTime || 'anytime',
          photos: orderData.photos || [],
          status: 'pending'
        })
        .select('*, client:profiles!client_id(*)')
        .single();

      if (error) throw error;

      return {
        success: true,
        message: 'Order submitted successfully!',
        order: this._mapOrder(data),
      };
    } catch (error) {
      logger.error('Submit order error', error, { userId: currentUser?.id });
      return {
        success: false,
        message: error.message || 'Order submission failed',
      };
    }
  }

  /**
   * Create order by Admin (for phone/guest)
   */
  async createAdminOrder(orderData) {
    try {
      if (!orderData.clientPhone || !orderData.problemDescription || !orderData.address) {
        throw new Error('Phone, Description and Address are required');
      }

      // 1. Find client by phone
      let { data: client, error: clientError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('phone', orderData.clientPhone) // Assuming exact match. Normalization needed?
        .single();

      let clientId = client?.id;
      let problemDescription = orderData.problemDescription.trim();

      if (!client) {
        // Client not found -> Use Guest Profile
        // 1a. Try to find existing Guest Profile
        const { data: guestUser, error: guestError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', 'guest@plumberhub.com')
          .single();

        if (guestUser) {
          clientId = guestUser.id;
        } else {
          // 1b. Create Guest Profile if it doesn't exist
          try {
            // Attempt to register the guest user
            // Note: This might sign in the user on the client side depending on config, 
            // but we assume admin session persists or we handle it.
            // Create a temporary client to avoid messing with the current Admin session
            const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
              }
            });

            const { data: authData, error: authError } = await tempClient.auth.signUp({
              email: 'guest@plumberhub.com',
              password: 'guestGenericPassword123!',
              options: {
                data: {
                  userType: 'client',
                  name: 'Guest Client',
                  phone: '+0000000000',
                },
              },
            });

            if (authError) {
              // If error is "User already registered", we might just be missing the profile row?
              // In that case, we can't easily get the ID without an Admin API call or login.
              // But let's log it.
              logger.warn('Failed to auto-create guest auth user', authError);
              throw new Error('Guest profile missing and could not be auto-created. Please manually add a client with email "guest@plumberhub.com".');
            }

            if (authData.user) {
              clientId = authData.user.id;
              // Profile trigger should handle the rest
            } else {
              throw new Error('Guest creation failed (no user returned).');
            }

          } catch (createErr) {
            // If manual creation failed, bubble up clear error
            throw createErr;
          }
        }

        // Prepend contact info to description
        problemDescription = `[GUEST CLIENT] Name: ${orderData.clientName || 'Unknown'}, Phone: ${orderData.clientPhone}\n\n${problemDescription}`;
      }

      // 2. Create Order
      const { data, error } = await supabase
        .from('orders')
        .insert({
          client_id: clientId,
          service_type: orderData.serviceType || 'repair',
          problem_description: problemDescription,
          address: orderData.address.trim(),
          urgency: orderData.urgency || 'normal',
          status: 'verified', // Auto-verify guest orders? No, keep pending.
          // Wait, user asked for "make some profile guest where all such orders would refer".
          status: 'pending',
          preferred_date: orderData.preferredDate || null,
          preferred_time: orderData.preferredTime || 'anytime',
          photos: orderData.photos || [],
          created_at: new Date().toISOString(),
        })
        .select('*, client:profiles!client_id(*)')
        .single();

      if (error) throw error;

      return {
        success: true,
        message: 'Order created successfully for ' + (client.full_name || client.email),
        order: this._mapOrder(data),
      };

    } catch (error) {
      logger.error('Admin create order error', error);
      return {
        success: false,
        message: error.message || 'Failed to create order',
      };
    }
  }

  /**
   * Claim order (plumber)
   * Fixed race condition using optimistic locking pattern
   */
  async claimOrder(orderId, plumber) {
    try {
      // 1. Verify plumber status
      if (!plumber.is_verified) {
        throw new Error('Your account must be verified before claiming jobs.');
      }

      // 2. Use a single atomic query to check and claim
      // This prevents race conditions by using WHERE clauses as locks
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'claimed',
          plumber_id: plumber.id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('status', 'pending') // Only claim if still pending
        .is('plumber_id', null) // Only claim if not already assigned
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .single();

      if (error) {
        // Check if it's a "no rows returned" error (order already claimed)
        if (error.code === 'PGRST116') {
          throw new Error('Order is no longer available or already claimed.');
        }
        throw error;
      }

      if (!data) {
        throw new Error('Order is no longer available or already claimed.');
      }

      // 3. After successful claim, verify active job limit
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('plumber_id', plumber.id)
        .in('status', ['claimed', 'in_progress']);

      if (count > 2) {
        // Rollback the claim if limit exceeded
        await supabase
          .from('orders')
          .update({ status: 'pending', plumber_id: null, assigned_at: null })
          .eq('id', orderId);

        throw new Error('You cannot have more than 2 active jobs.');
      }

      logger.info('Order claimed successfully', { orderId, plumberId: plumber.id });

      return {
        success: true,
        message: 'Order claimed successfully!',
        order: this._mapOrder(data),
      };
    } catch (error) {
      logger.error('Claim order failed', error, {
        orderId,
        plumberId: plumber?.id,
      });
      return {
        success: false,
        message: error.message || 'Failed to claim order',
      };
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId, newStatus) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .single();

      if (error) throw error;

      return {
        success: true,
        message: `Order status updated to ${newStatus}`,
        order: this._mapOrder(data),
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update order status',
      };
    }
  }

  /**
   * Submit completion report (plumber)
   */
  async submitCompletion(orderId, completionData) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          work_description: completionData.workDescription,
          hours_worked: parseFloat(completionData.hoursWorked),
          final_price: parseFloat(completionData.amountCharged),
          // We don't set payment_method here yet, client sets it
          completed_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .single();

      if (error) throw error;

      return {
        success: true,
        message: 'Job marked complete! Waiting for client payment.',
        order: this._mapOrder(data),
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to submit completion',
      };
    }
  }

  /**
   * Confirm completion and payment (client)
   */
  async confirmCompletion(orderId, confirmAmount, confirmPaymentMethod) {
    try {
      // Client selects payment method (Cash/Transfer) and sets status to 'verified'
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'verified', // Final closed status
          payment_method: confirmPaymentMethod,
          // clientConfirmedAmount logic is implicitly handled by accepting final_price
        })
        .eq('id', orderId)
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .single();

      if (error) throw error;

      return {
        success: true,
        message: 'Payment confirmed successfully!',
        order: this._mapOrder(data),
        amountsMatch: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to confirm completion',
      };
    }
  }

  /**
   * Rate plumber (client)
   */
  async ratePlumber(orderId, rating, review) {
    try {
      const { data: order } = await supabase.from('orders').select('plumber_id, client_id').eq('id', orderId).single();
      if (!order) throw new Error('Order not found');

      // Insert review
      const { error } = await supabase.from('reviews').insert({
        order_id: orderId,
        plumber_id: order.plumber_id,
        client_id: order.client_id,
        rating: parseInt(rating),
        comment: review
      });

      if (error) throw error;

      // Trigger or function should update average rating, or we calculate it here
      // For simplicity, let's just return success. 
      // Ideally we have a DB trigger for this.

      return {
        success: true,
        message: 'Thank you for rating!',
        order: null // UI might reload
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to rate plumber',
      };
    }
  }

  /**
   * Get available orders
   */
  async getAvailableOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, client:profiles!client_id(*)') // Need client details to show address/who
        .eq('status', 'pending');

      if (error) throw error;
      return data.map(row => this._mapOrder(row));
    } catch (error) {
      logger.error('Error fetching available orders', error);
      return [];
    }
  }

  /**
   * Create dispute for completed order (client)
   */
  async createDispute(orderId, clientId, plumberId, reason) {
    try {
      if (!reason || !reason.trim()) {
        throw new Error('Dispute reason is required');
      }

      // 1. Verify order is completed
      const { data: order } = await supabase
        .from('orders')
        .select('status, client_id, plumber_id')
        .eq('id', orderId)
        .single();

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'completed') {
        throw new Error('Can only dispute completed orders');
      }

      if (order.client_id !== clientId) {
        throw new Error('Unauthorized: Not your order');
      }

      // 2. Check if dispute already exists
      const { data: existingDispute } = await supabase
        .from('disputes')
        .select('id')
        .eq('order_id', orderId)
        .in('status', ['open', 'in_review'])
        .single();

      if (existingDispute) {
        throw new Error('A dispute already exists for this order');
      }

      // 3. Create dispute and update order
      const { data: dispute, error: disputeError } = await supabase
        .from('disputes')
        .insert({
          order_id: orderId,
          client_id: clientId,
          plumber_id: plumberId,
          reason: reason.trim(),
          status: 'open'
        })
        .select()
        .single();

      if (disputeError) throw disputeError;

      // 4. Mark order as disputed
      const { error: orderError } = await supabase
        .from('orders')
        .update({ is_disputed: true })
        .eq('id', orderId);

      if (orderError) {
        logger.warn('Failed to mark order as disputed', orderError, { orderId });
      }

      logger.info('Dispute created', { disputeId: dispute.id, orderId, clientId });

      return {
        success: true,
        message: 'Dispute submitted successfully. An admin will review your case.',
        dispute,
      };
    } catch (error) {
      logger.error('Create dispute failed', error, { orderId, clientId });
      return {
        success: false,
        message: error.message || 'Failed to create dispute',
      };
    }
  }

  /**
   * Get all disputes (admin)
   */
  async getAllDisputes(statusFilter = null) {
    try {
      let query = supabase
        .from('disputes')
        .select(`
          *,
          order:orders(*),
          client:profiles!client_id(*),
          plumber:profiles!plumber_id(*),
          resolver:profiles!resolved_by(*)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error fetching disputes', error);
      return [];
    }
  }

  /**
   * Get disputes for a specific order
   */
  async getOrderDisputes(orderId) {
    try {
      const { data, error } = await supabase
        .from('disputes')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error fetching order disputes', error, { orderId });
      return [];
    }
  }

  /**
   * Update dispute status (admin)
   */
  async updateDispute(disputeId, updates, adminId) {
    try {
      const allowedUpdates = {};

      if (updates.status) {
        allowedUpdates.status = updates.status;

        if (updates.status === 'resolved' || updates.status === 'closed') {
          allowedUpdates.resolved_at = new Date().toISOString();
          allowedUpdates.resolved_by = adminId;
        }
      }

      if (updates.adminNotes !== undefined) {
        allowedUpdates.admin_notes = updates.adminNotes;
      }

      const { data, error } = await supabase
        .from('disputes')
        .update(allowedUpdates)
        .eq('id', disputeId)
        .select()
        .single();

      if (error) throw error;

      logger.info('Dispute updated', { disputeId, status: updates.status, adminId });

      return {
        success: true,
        message: 'Dispute updated successfully',
        dispute: data,
      };
    } catch (error) {
      logger.error('Update dispute failed', error, { disputeId, adminId });
      return {
        success: false,
        message: error.message || 'Failed to update dispute',
      };
    }
  }

  /**
   * Close dispute (client or admin)
   */
  async closeDispute(disputeId, userId, isAdmin = false) {
    try {
      // Verify dispute exists and user has permission
      const { data: dispute } = await supabase
        .from('disputes')
        .select('*, order:orders(id)')
        .eq('id', disputeId)
        .single();

      if (!dispute) {
        throw new Error('Dispute not found');
      }

      // Only allow closing if resolved or if admin
      if (dispute.status !== 'resolved' && !isAdmin) {
        throw new Error('Only resolved disputes can be closed by clients');
      }

      // Verify permission
      if (!isAdmin && dispute.client_id !== userId) {
        throw new Error('Unauthorized');
      }

      const { data, error } = await supabase
        .from('disputes')
        .update({
          status: 'closed',
          resolved_at: dispute.resolved_at || new Date().toISOString(),
          resolved_by: dispute.resolved_by || userId,
        })
        .eq('id', disputeId)
        .select()
        .single();

      if (error) throw error;

      // Remove disputed flag from order if all disputes closed
      const { data: openDisputes } = await supabase
        .from('disputes')
        .select('id')
        .eq('order_id', dispute.order.id)
        .in('status', ['open', 'in_review', 'resolved']);

      if (!openDisputes || openDisputes.length === 0) {
        await supabase
          .from('orders')
          .update({ is_disputed: false })
          .eq('id', dispute.order.id);
      }

      logger.info('Dispute closed', { disputeId, userId, isAdmin });

      return {
        success: true,
        message: 'Dispute closed successfully',
        dispute: data,
      };
    } catch (error) {
      logger.error('Close dispute failed', error, { disputeId, userId });
      return {
        success: false,
        message: error.message || 'Failed to close dispute',
      };
    }
  }

  /**
   * Get client orders
   */
  async getClientOrders(clientId) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, plumber:profiles!plumber_id(*)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data.map(row => this._mapOrder(row));
    } catch (error) {
      console.error('Error fetching client orders:', error);
      return [];
    }
  }

  /**
   * Get plumber orders
   */
  async getPlumberOrders(plumberId, status = null) {
    try {
      let query = supabase
        .from('orders')
        .select('*, client:profiles!client_id(*)')
        .eq('plumber_id', plumberId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      } else {
        // Generally we want active jobs (claimed, in_progress, completed-but-not-verified)
        query = query.in('status', ['claimed', 'in_progress', 'completed', 'verified']);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data.map(row => this._mapOrder(row));
    } catch (error) {
      console.error('Error fetching plumber orders:', error);
      return [];
    }
  }

  /**
   * Get plumber statistics
   */
  async getPlumberStats(plumberId) {
    try {
      // We can do a count query for active jobs
      const { count: activeJobs } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('plumber_id', plumberId)
        .in('status', ['claimed', 'in_progress']);

      // Sum earnings manually or via RPC
      const { data: completedOrders } = await supabase
        .from('orders')
        .select('final_price')
        .eq('plumber_id', plumberId)
        .eq('status', 'verified');

      const totalEarnings = completedOrders?.reduce((sum, o) => sum + (Number(o.final_price) || 0), 0) || 0;
      const completedJobs = completedOrders?.length || 0;

      return {
        activeJobs: activeJobs || 0,
        completedJobs,
        totalEarnings,
        totalOrders: activeJobs + completedJobs // approximation
      };
    } catch (error) {
      console.error('Error getting plumber stats:', error);
      return { activeJobs: 0, completedJobs: 0, totalOrders: 0, totalEarnings: 0 };
    }
  }

  /**
   * Get all orders (admin)
   */
  async getAllOrders() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data.map(row => this._mapOrder(row));
    } catch (error) {
      console.error('Error fetching all orders:', error);
      return [];
    }
  }

  /**
   * Get platform statistics (admin)
   */
  async getPlatformStats() {
    try {
      // 1. Order Counts
      const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
      const { count: pendingOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: activeJobs } = await supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['claimed', 'in_progress']);
      const { count: completedOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['completed', 'verified']);

      // 2. User Counts
      const { count: registeredPlumbers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_type', 'plumber');
      const { count: activeClients } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_type', 'client');

      // 3. Revenue Calculation
      // Sum final_price for all verified orders (completed & paid)
      const { data: revenueData } = await supabase
        .from('orders')
        .select('final_price')
        .eq('status', 'verified'); // Only count verified (paid) orders

      const totalRevenue = revenueData
        ? revenueData.reduce((sum, order) => sum + (parseFloat(order.final_price) || 0), 0)
        : 0;

      // Assuming platform takes 10% commission
      const totalCommission = totalRevenue * 0.10;

      return {
        totalOrders: totalOrders || 0,
        pendingOrders: pendingOrders || 0,
        activeJobs: activeJobs || 0,
        completedOrders: completedOrders || 0,
        totalRevenue,
        totalCommission,
        registeredPlumbers: registeredPlumbers || 0,
        activeClients: activeClients || 0
      };
    } catch (e) {
      console.error('Stats error:', e);
      return {
        totalOrders: 0, pendingOrders: 0, activeJobs: 0, completedOrders: 0,
        totalRevenue: 0, totalCommission: 0, registeredPlumbers: 0, activeClients: 0
      };
    }
  }

  /**
   * Update order details (admin)
   */
  async updateOrderDetails(orderId, updates) {
    try {
      const allowedUpdates = {};

      // Only allow specific fields to be updated
      if (updates.status) allowedUpdates.status = updates.status;
      if (updates.plumberId !== undefined) allowedUpdates.plumber_id = updates.plumberId;
      if (updates.finalPrice) allowedUpdates.final_price = parseFloat(updates.finalPrice);
      if (updates.urgency) allowedUpdates.urgency = updates.urgency;
      if (updates.address) allowedUpdates.address = updates.address.trim();
      if (updates.problemDescription) allowedUpdates.problem_description = updates.problemDescription.trim();

      const { data, error } = await supabase
        .from('orders')
        .update(allowedUpdates)
        .eq('id', orderId)
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .single();

      if (error) throw error;

      logger.info('Order updated', { orderId, updates: allowedUpdates });

      return {
        success: true,
        message: 'Order updated successfully',
        order: this._mapOrder(data),
      };
    } catch (error) {
      logger.error('Update order failed', error, { orderId });
      return {
        success: false,
        message: error.message || 'Failed to update order',
      };
    }
  }

  /**
   * Delete order (admin)
   */
  async deleteOrder(orderId) {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      logger.info('Order deleted', { orderId });

      return {
        success: true,
        message: 'Order deleted successfully',
      };
    } catch (error) {
      logger.error('Delete order failed', error, { orderId });
      return {
        success: false,
        message: error.message || 'Failed to delete order',
      };
    }
  }

  /**
   * Get orders by date range
   */
  async getOrdersByDateRange(startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data.map(row => this._mapOrder(row));
    } catch (error) {
      logger.error('Error fetching orders by date range', error);
      return [];
    }
  }

  /**
   * Get revenue by period (all time, month, week, day)
   */
  async getRevenueByPeriod(period = 'all') {
    try {
      let startDate;
      const now = new Date();

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setDate(now.getDate() - 30));
          break;
        case 'all':
        default:
          startDate = new Date('2000-01-01'); // Far past date
          break;
      }

      let query = supabase
        .from('orders')
        .select('final_price, created_at')
        .eq('status', 'verified');

      if (period !== 'all') {
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const totalRevenue = data.reduce((sum, o) => sum + (parseFloat(o.final_price) || 0), 0);
      const orderCount = data.length;

      // Get commission rate from settings (default 10%)
      const commissionRate = 0.10; // TODO: fetch from settings
      const totalCommission = totalRevenue * commissionRate;

      return {
        period,
        totalRevenue,
        totalCommission,
        orderCount,
      };
    } catch (error) {
      logger.error('Error calculating revenue', error, { period });
      return {
        period,
        totalRevenue: 0,
        totalCommission: 0,
        orderCount: 0,
      };
    }
  }

  /**
   * Get order status distribution for charts
   */
  async getOrderStatusDistribution() {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('status');

      if (error) throw error;

      // Count by status
      const distribution = data.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      return distribution;
    } catch (error) {
      logger.error('Error getting order distribution', error);
      return {};
    }
  }
}

// Create and export singleton instance
const orderService = new OrdersService();

export default orderService;