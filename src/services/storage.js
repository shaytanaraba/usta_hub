/**
 * Storage Service for React Native
 * Handles data persistence using AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

class StorageService {
  constructor() {
    this.STORAGE_KEYS = {
      USERS: '@plumberhub_users',
      ORDERS: '@plumberhub_orders',
      CURRENT_USER: '@plumberhub_current_user',
      SETTINGS: '@plumberhub_settings',
    };
  }

  /**
   * Generate unique ID
   */
  generateId(prefix = 'ID') {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 7);
    return `${prefix}-${timestamp}${randomStr}`.toUpperCase();
  }

  /**
   * Initialize storage with default data
   */
  async initializeStorage() {
    try {
      // Check if already initialized
      const initialized = await AsyncStorage.getItem('@plumberhub_initialized');
      if (initialized) return;

      // Create default admin user
      const defaultAdmin = {
        id: 'ADM-000001',
        userType: 'admin',
        email: 'admin@plumber.com',
        password: 'YWRtaW4xMjM=', // base64 of 'admin123'
        name: 'System Administrator',
        phone: '+1-800-PLUMBER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        adminLevel: 'superadmin',
      };

      // Create demo client
      const demoClient = {
        id: 'USR-000001',
        userType: 'client',
        email: 'client@test.com',
        password: 'Y2xpZW50MTIz', // base64 of 'client123'
        name: 'John Doe',
        phone: '+1-555-0101',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create demo plumber
      const demoPlumber = {
        id: 'USR-000002',
        userType: 'plumber',
        email: 'plumber@test.com',
        password: 'cGx1bWJlcjEyMw==', // base64 of 'plumber123'
        name: 'Mike Johnson',
        phone: '+1-555-0202',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        plumberProfile: {
          licenseNumber: 'PL123456',
          specializations: ['residential', 'emergency', 'installations'],
          serviceArea: 'New York City',
          experience: '5 years',
          isVerified: true,
          rating: 4.5,
          completedJobs: 23,
        },
      };

      // Create default settings
      const defaultSettings = {
        commissionRate: 0.15,
        bankDetails: {
          bankName: 'Example Bank',
          accountNumber: '1234567890',
          accountName: 'PlumberHub LLC',
          routingNumber: '021000021',
        },
        contactEmail: 'support@plumberhub.com',
        contactPhone: '+1-800-PLUMBER',
      };

      // Save all data
      await AsyncStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify([defaultAdmin, demoClient, demoPlumber]));
      await AsyncStorage.setItem(this.STORAGE_KEYS.ORDERS, JSON.stringify([]));
      await AsyncStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(defaultSettings));
      await AsyncStorage.setItem('@plumberhub_initialized', 'true');

      console.log('Storage initialized successfully');
    } catch (error) {
      console.error('Error initializing storage:', error);
    }
  }

  /**
   * Get users from storage
   */
  async getUsers() {
    try {
      const usersJson = await AsyncStorage.getItem(this.STORAGE_KEYS.USERS);
      return usersJson ? JSON.parse(usersJson) : [];
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  /**
   * Add user to storage
   */
  async addUser(user) {
    try {
      const users = await this.getUsers();
      users.push(user);
      await AsyncStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
      return user;
    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const users = await this.getUsers();
      return users.find(user => user.id === userId) || null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    try {
      const users = await this.getUsers();
      return users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    try {
      const users = await this.getUsers();
      const userIndex = users.findIndex(user => user.id === userId);
      
      if (userIndex === -1) {
        throw new Error('User not found');
      }

      users[userIndex] = {
        ...users[userIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(users));
      return users[userIndex];
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Get current user from session
   */
  async getCurrentUser() {
    try {
      const userJson = await AsyncStorage.getItem(this.STORAGE_KEYS.CURRENT_USER);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Set current user session
   */
  async setCurrentUser(user) {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } catch (error) {
      console.error('Error setting current user:', error);
      throw error;
    }
  }

  /**
   * Clear current user session
   */
  async clearCurrentUser() {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEYS.CURRENT_USER);
    } catch (error) {
      console.error('Error clearing current user:', error);
      throw error;
    }
  }

  /**
   * Get orders from storage
   */
  async getOrders() {
    try {
      const ordersJson = await AsyncStorage.getItem(this.STORAGE_KEYS.ORDERS);
      return ordersJson ? JSON.parse(ordersJson) : [];
    } catch (error) {
      console.error('Error getting orders:', error);
      return [];
    }
  }

  /**
   * Add order to storage
   */
  async addOrder(order) {
    try {
      const orders = await this.getOrders();
      orders.push(order);
      await AsyncStorage.setItem(this.STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      return order;
    } catch (error) {
      console.error('Error adding order:', error);
      throw error;
    }
  }

  /**
   * Update order
   */
  async updateOrder(orderId, updates) {
    try {
      const orders = await this.getOrders();
      const orderIndex = orders.findIndex(order => order.id === orderId);
      
      if (orderIndex === -1) {
        throw new Error('Order not found');
      }

      orders[orderIndex] = {
        ...orders[orderIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(this.STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      return orders[orderIndex];
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId) {
    try {
      const orders = await this.getOrders();
      return orders.find(order => order.id === orderId) || null;
    } catch (error) {
      console.error('Error getting order by ID:', error);
      return null;
    }
  }

  /**
   * Get orders by client ID
   */
  async getOrdersByClient(clientId) {
    try {
      const orders = await this.getOrders();
      return orders.filter(order => order.clientId === clientId);
    } catch (error) {
      console.error('Error getting orders by client:', error);
      return [];
    }
  }

  /**
   * Get orders by plumber ID
   */
  async getOrdersByPlumber(plumberId, status = null) {
    try {
      const orders = await this.getOrders();
      let filtered = orders.filter(order => 
        order.assignedPlumber && order.assignedPlumber.plumberId === plumberId
      );
      
      if (status) {
        filtered = filtered.filter(order => order.status === status);
      }
      
      return filtered;
    } catch (error) {
      console.error('Error getting orders by plumber:', error);
      return [];
    }
  }

  /**
   * Get available orders (pending status)
   */
  async getAvailableOrders() {
    try {
      const orders = await this.getOrders();
      return orders.filter(order => order.status === 'pending');
    } catch (error) {
      console.error('Error getting available orders:', error);
      return [];
    }
  }

  /**
   * Get settings
   */
  async getSettings() {
    try {
      const settingsJson = await AsyncStorage.getItem(this.STORAGE_KEYS.SETTINGS);
      return settingsJson ? JSON.parse(settingsJson) : null;
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  }

  /**
   * Update settings
   */
  async updateSettings(settings) {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return settings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Clear all data (for testing)
   */
  async clearAll() {
    try {
      await AsyncStorage.multiRemove([
        this.STORAGE_KEYS.USERS,
        this.STORAGE_KEYS.ORDERS,
        this.STORAGE_KEYS.CURRENT_USER,
        this.STORAGE_KEYS.SETTINGS,
        '@plumberhub_initialized',
      ]);
    } catch (error) {
      console.error('Error clearing storage:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const storage = new StorageService();

export default storage;