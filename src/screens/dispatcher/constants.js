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

export const STATUS_OPTIONS = [
  { id: 'Active', label: 'statusActive' },
  { id: 'Payment', label: 'statusPayment' },
  { id: 'Confirmed', label: 'filterStatusConfirmed' },
  { id: 'Canceled', label: 'statusCanceled' },
];

export const URGENCY_OPTIONS = [
  { id: 'all', label: 'filterAllUrgency' },
  { id: 'emergency', label: 'urgencyEmergency' },
  { id: 'urgent', label: 'urgencyUrgent' },
  { id: 'planned', label: 'urgencyPlanned' },
];

export const ATTENTION_FILTER_OPTIONS = [
  { id: 'All', label: 'issueAllIssues' },
  { id: 'Stuck', label: 'issueStuck' },
  { id: 'Disputed', label: 'issueDisputed' },
  { id: 'Payment', label: 'issueUnpaid' },
  { id: 'Canceled', label: 'issueCanceled' },
];

export const SORT_OPTIONS = [
  { id: 'newest', label: 'filterNewestFirst' },
  { id: 'oldest', label: 'filterOldestFirst' },
];

export const STORAGE_KEYS = {
  DRAFT: 'dispatcher_draft_order',
  RECENT_ADDR: 'dispatcher_recent_addresses',
};

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

export const DISPATCHER_TABS = ['stats', 'queue', 'create', 'settings'];
