export const ADMIN_TAB_KEYS = ['analytics', 'people', 'create_order', 'orders', 'settings'];
export const DEFAULT_ADMIN_TAB = 'analytics';

export const normalizeAdminTab = (tab) => {
  const key = String(tab || '').trim();
  return ADMIN_TAB_KEYS.includes(key) ? key : DEFAULT_ADMIN_TAB;
};

export const buildAdminMenuItems = (translations = {}) => ([
  { key: 'analytics', label: translations.analytics || 'Analytics', icon: 'analytics' },
  { key: 'people', label: translations.team || translations.tabTeam || 'Team', icon: 'people' },
  { key: 'create_order', label: translations.createOrder || 'Create Order', icon: 'add' },
  { key: 'orders', label: translations.ordersQueue || translations.orders || 'Order Queue', icon: 'list' },
  { key: 'settings', label: translations.settings || 'Settings', icon: 'settings' },
]);

export const URGENCY_OPTIONS = [
  { id: 'all', label: 'filterAll' },
  { id: 'emergency', label: 'urgencyEmergency' },
  { id: 'urgent', label: 'urgencyUrgent' },
  { id: 'planned', label: 'urgencyPlanned' },
];

export const STATUS_OPTIONS = [
  { id: 'Active', label: 'statusActive' },
  { id: 'Payment', label: 'statusPayment' },
  { id: 'Confirmed', label: 'filterStatusConfirmed' },
  { id: 'Canceled', label: 'statusCanceled' },
];

export const SORT_OPTIONS = [
  { id: 'newest', label: 'filterNewestFirst' },
  { id: 'oldest', label: 'filterOldestFirst' },
];

export const ATTENTION_FILTER_OPTIONS = [
  { id: 'All', label: 'issueAllIssues' },
  { id: 'Stuck', label: 'issueStuck' },
  { id: 'Disputed', label: 'issueDisputed' },
  { id: 'Payment', label: 'issueUnpaid' },
  { id: 'Canceled', label: 'issueCanceled' },
];

export const SERVICE_TYPES = [
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'electrician', label: 'Electrician' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'carpenter', label: 'Carpenter' },
  { id: 'repair', label: 'Repair' },
  { id: 'installation', label: 'Installation' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'other', label: 'Other' },
];

export const INITIAL_ORDER_STATE = {
  clientName: '',
  clientPhone: '',
  pricingType: 'unknown',
  initialPrice: '',
  calloutFee: '',
  serviceType: 'repair',
  urgency: 'planned',
  problemDescription: '',
  area: '',
  fullAddress: '',
  orientir: '',
  preferredDate: '',
  preferredTime: '',
  dispatcherNote: '',
};
