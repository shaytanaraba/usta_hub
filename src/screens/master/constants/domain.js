export const MASTER_TABS = {
  ORDERS: 'orders',
  ACCOUNT: 'account',
};

export const ORDER_SECTIONS = {
  AVAILABLE: 'available',
  MY_JOBS: 'myJobs',
};

export const ACCOUNT_VIEWS = {
  MENU: 'menu',
  HISTORY: 'history',
  PROFILE: 'profile',
  SETTINGS: 'settings',
};

export const TERMINAL_ORDER_STATUSES = [
  'completed',
  'confirmed',
  'canceled_by_master',
  'canceled_by_client',
  'expired',
];

export const MY_JOBS_RELEVANT_STATUSES = ['claimed', 'started', 'completed'];

export const URGENCY_RANK = {
  emergency: 0,
  urgent: 1,
  planned: 2,
};

export const MY_JOBS_STATUS_PRIORITY = {
  started: 0,
  claimed: 1,
  completed: 2,
};
