/**
 * Helper Utilities
 * Formatting and utility functions for the app
 */

import { STATUS_COLORS } from './orderHelpers';
import { isValidKyrgyzPhone, normalizeKyrgyzPhone } from './phone';

/**
 * Format date and time
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return date.toLocaleDateString('en-US', options);
};

/**
 * Format currency
 */
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '$0.00';
  return `$${parseFloat(amount).toFixed(2)}`;
};

/**
 * Time ago helper
 */
export const timeAgo = (dateString) => {
  if (!dateString) return 'Unknown';

  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'Just now';
};

/**
 * Get status color
 */
export const getStatusColor = (status) => {
  const legacyColors = {
    pending: STATUS_COLORS.placed,
    in_progress: STATUS_COLORS.started,
    verified: STATUS_COLORS.confirmed,
    cancelled: STATUS_COLORS.canceled_by_client,
    canceled: STATUS_COLORS.canceled_by_client,
  };

  return STATUS_COLORS[status] || legacyColors[status] || '#94A3B8';
};

/**
 * Get status badge style
 */
export const getStatusBadgeStyle = (status) => {
  return {
    backgroundColor: getStatusColor(status),
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  };
};

/**
 * Validate email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone
 */
export const isValidPhone = (phone) => {
  return isValidKyrgyzPhone(phone);
};

/**
 * Truncate text
 */
export const truncate = (text, maxLength = 100) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Capitalize first letter
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Format phone number
 */
export const formatPhone = (phone) => {
  if (!phone) return '';
  return normalizeKyrgyzPhone(phone) || phone;
};

/**
 * Get urgency color
 */
export const getUrgencyColor = (urgency) => {
  const colors = {
    normal: '#64748B',    // Slate
    planned: '#64748B',   // Slate
    urgent: '#F59E0B',    // Amber
    emergency: '#EF4444', // Red
  };
  return colors[urgency] || '#94A3B8';
};

/**
 * Get urgency label
 */
export const getUrgencyLabel = (urgency) => {
  const labels = {
    normal: 'NORMAL',
    urgent: 'URGENT',
    emergency: '🚨 EMERGENCY',
  };
  return labels[urgency] || urgency.toUpperCase();
};
