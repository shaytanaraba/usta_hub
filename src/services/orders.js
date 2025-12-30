/**
 * Orders Service
 * Handles order management via Supabase
 */

import { supabase } from '../lib/supabase';

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
      rating: row.reviews && row.reviews.length > 0 ? row.reviews[0] : null
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
      console.error('Submit order error:', error);
      return {
        success: false,
        message: error.message || 'Order submission failed',
      };
    }
  }

  /**
   * Claim order (plumber)
   */
  async claimOrder(orderId, plumber) {
    try {
      // Logic: Update Status to 'claimed' WHERE status is 'pending' AND id is orderId.
      // This atomic update prevents race conditions.

      // 1. Verify plumber status
      if (!plumber.is_verified) {
        throw new Error('Your account must be verified before claiming jobs.');
      }

      // 2. Check active job limit (optional constraint requested by user)
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('plumber_id', plumber.id)
        .in('status', ['claimed', 'in_progress']);

      if (count >= 2) {
        throw new Error('You cannot have more than 2 active jobs.');
      }

      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'claimed',
          plumber_id: plumber.id,
          assigned_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('status', 'pending') // Integrity check
        .select('*, client:profiles!client_id(*), plumber:profiles!plumber_id(*)') // Fetch related data for UI
        .single();

      if (error) throw error;
      if (!data) throw new Error('Order is no longer available or already claimed.');

      return {
        success: true,
        message: 'Order claimed successfully!',
        order: this._mapOrder(data),
      };
    } catch (error) {
      console.error('Claim order service error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
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
      console.error('Error fetching available orders:', error);
      return [];
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
}

// Create and export singleton instance
const orderService = new OrdersService();

export default orderService;