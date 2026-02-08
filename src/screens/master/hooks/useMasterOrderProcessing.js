import { useMemo } from 'react';
import {
  MY_JOBS_RELEVANT_STATUSES,
  MY_JOBS_STATUS_PRIORITY,
  ORDER_SECTIONS,
  URGENCY_RANK,
} from '../constants/domain';

const getPreferredStamp = (order) => {
  if (order?.preferred_date) {
    const dateStr = order.preferred_date;
    const timeStr = order.preferred_time || '00:00:00';
    const raw = `${dateStr}T${timeStr}`;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const created = Date.parse(order?.created_at || '');
  return Number.isNaN(created) ? 0 : created;
};

export const filterPoolOrders = (availableOrders = [], filters = {}) => {
  const nextFilters = {
    urgency: filters?.urgency || 'all',
    service: filters?.service || 'all',
    area: filters?.area || 'all',
    pricing: filters?.pricing || 'all',
  };

  const filtered = availableOrders.filter((order) => {
    if (nextFilters.urgency !== 'all' && order.urgency !== nextFilters.urgency) return false;
    if (nextFilters.service !== 'all' && order.service_type !== nextFilters.service) return false;
    if (nextFilters.area !== 'all' && order.area !== nextFilters.area) return false;
    if (nextFilters.pricing !== 'all' && order.pricing_type !== nextFilters.pricing) return false;
    return true;
  });

  if (nextFilters.urgency === 'all') {
    return [...filtered].sort((a, b) => {
      const rankA = URGENCY_RANK[a.urgency] ?? 9;
      const rankB = URGENCY_RANK[b.urgency] ?? 9;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  return filtered;
};

export const sortMyJobs = (myOrders = []) => {
  const relevant = myOrders.filter((order) => MY_JOBS_RELEVANT_STATUSES.includes(order.status));
  return [...relevant].sort((a, b) => {
    const priA = MY_JOBS_STATUS_PRIORITY[a.status] ?? 9;
    const priB = MY_JOBS_STATUS_PRIORITY[b.status] ?? 9;
    if (priA !== priB) return priA - priB;

    if (a.status === 'claimed' && b.status === 'claimed') {
      const urgA = URGENCY_RANK[a.urgency] ?? 9;
      const urgB = URGENCY_RANK[b.urgency] ?? 9;
      if (urgA !== urgB) return urgA - urgB;
      return getPreferredStamp(a) - getPreferredStamp(b);
    }

    if (a.status === 'completed' && b.status === 'completed') {
      const compA = Date.parse(a.completed_at || a.created_at || '');
      const compB = Date.parse(b.completed_at || b.created_at || '');
      return (Number.isNaN(compB) ? 0 : compB) - (Number.isNaN(compA) ? 0 : compA);
    }

    if (a.status === 'started' && b.status === 'started') {
      return getPreferredStamp(a) - getPreferredStamp(b);
    }

    return 0;
  });
};

export const buildMasterCounters = (myOrders = []) => {
  const active = myOrders.filter((order) => MY_JOBS_RELEVANT_STATUSES.includes(order.status));
  const immediate = myOrders.filter(
    (order) => ['claimed', 'started'].includes(order.status) && ['urgent', 'emergency'].includes(order.urgency),
  );
  const started = myOrders.filter((order) => order.status === 'started');
  const pending = myOrders.filter((order) => order.status === 'completed');
  return {
    activeJobsCount: active.length,
    immediateOrdersCount: immediate.length,
    startedOrdersCount: started.length,
    pendingOrdersCount: pending.length,
  };
};

export const useMasterOrderProcessing = ({ availableOrders, myOrders, filters, orderSection }) => {
  const processedOrders = useMemo(() => {
    if (orderSection === ORDER_SECTIONS.MY_JOBS) {
      return sortMyJobs(myOrders);
    }
    return filterPoolOrders(availableOrders, filters);
  }, [availableOrders, myOrders, filters, orderSection]);

  const counters = useMemo(() => buildMasterCounters(myOrders), [myOrders]);

  return { processedOrders, ...counters };
};
