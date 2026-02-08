import { ORDER_STATUS } from '../../../services/orders';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const normalizeMasterOrder = (order, fallbackStatus = ORDER_STATUS.PLACED) => {
  if (!isObject(order)) {
    return null;
  }

  const normalized = {
    ...order,
    status: order.status || fallbackStatus,
    urgency: order.urgency || 'planned',
    service_type: order.service_type || order.serviceType || 'repair',
    area: order.area || order.district || '',
    pricing_type: order.pricing_type || order.pricingType || 'unknown',
  };

  return normalized.id ? normalized : null;
};

export const normalizeMasterOrderList = (orders, fallbackStatus = ORDER_STATUS.PLACED) => {
  if (!Array.isArray(orders)) return [];
  return orders
    .map((item) => normalizeMasterOrder(item, fallbackStatus))
    .filter(Boolean);
};
