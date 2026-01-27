export const STATUS_COLORS = {
    placed: '#3b82f6',
    claimed: '#f59e0b',
    started: '#8b5cf6',
    completed: '#f97316',
    confirmed: '#22c55e',
    canceled_by_master: '#ef4444',
    canceled_by_client: '#ef4444',
    reopened: '#06b6d4',
    expired: '#6b7280',
};

const SERVICE_LABEL_KEY_MAP = {
    plumbing: 'servicePlumbing',
    electrician: 'serviceElectrician',
    cleaning: 'serviceCleaning',
    carpenter: 'serviceCarpenter',
    repair: 'serviceRepair',
    installation: 'serviceInstallation',
    maintenance: 'serviceMaintenance',
    other: 'serviceOther',
    appliancerepair: 'serviceApplianceRepair',
    building: 'serviceBuilding',
    inspection: 'serviceInspection',
    hvac: 'serviceHvac',
    painting: 'servicePainting',
    flooring: 'serviceFlooring',
    roofing: 'serviceRoofing',
    landscaping: 'serviceLandscaping',
};

const STATUS_LABEL_KEY_MAP = {
    placed: 'statusPlaced',
    claimed: 'statusClaimed',
    started: 'statusStarted',
    completed: 'statusCompleted',
    confirmed: 'statusConfirmed',
    canceled_by_master: 'statusCanceledByMaster',
    canceled_by_client: 'statusCanceledByClient',
    reopened: 'statusReopened',
    expired: 'statusExpired',
};

const isMissingTranslation = (value, key) => !value || value === key;

export const getServiceLabel = (serviceCode, t) => {
    if (!serviceCode) return '';
    const normalized = serviceCode.toLowerCase().replace(/_/g, '');
    const translationKey = SERVICE_LABEL_KEY_MAP[normalized];
    if (translationKey && typeof t === 'function') {
        const translated = t(translationKey);
        if (!isMissingTranslation(translated, translationKey)) return translated;
    }
    return serviceCode.charAt(0).toUpperCase() + serviceCode.slice(1).replace(/_/g, ' ');
};

export const getOrderStatusLabel = (status, t) => {
    if (!status) return '';
    const translationKey = STATUS_LABEL_KEY_MAP[status];
    if (translationKey && typeof t === 'function') {
        const translated = t(translationKey);
        if (!isMissingTranslation(translated, translationKey)) return translated.toUpperCase();
    }
    return status.replace(/_/g, ' ').toUpperCase();
};

export const getTimeAgo = (date, t) => {
    if (!date) return '';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const justNow = typeof t === 'function' ? t('justNow') : 'Just now';
    const minsAgo = typeof t === 'function' ? t('minsAgo') : 'm ago';
    const hoursAgo = typeof t === 'function' ? t('hoursAgo') : 'h ago';
    const daysAgo = typeof t === 'function' ? t('daysAgo') : 'd ago';

    if (diffMins < 1) return justNow || 'Just now';
    if (diffMins < 60) return `${diffMins} ${minsAgo || 'm ago'}`;
    if (diffHours < 24) return `${diffHours} ${hoursAgo || 'h ago'}`;
    return `${diffDays} ${daysAgo || 'd ago'}`;
};
