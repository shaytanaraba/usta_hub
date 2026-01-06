/**
 * Localization Context
 * Multi-language support for EN, RU, KG
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Available languages
export const LANGUAGES = {
    en: 'English',
    ru: 'Русский',
    kg: 'Кыргызча',
};

// Translations
const translations = {
    en: {
        // Header
        verified: 'Verified',
        unverified: 'Unverified',
        logout: 'Logout',
        confirmLogout: 'Are you sure you want to logout?',

        // Tabs
        tabPool: 'Available',
        tabJobs: 'My Jobs',
        tabFinances: 'Finances',

        // Filters
        filterLabel: 'Filter',
        filterUrgency: 'Urgency',
        filterService: 'Service',
        filterArea: 'Area',
        filterPrice: 'Price',
        filterClear: 'Clear',
        filterAll: 'All',
        filterCustom: 'Custom',
        labelStartDate: 'Start Date',
        labelEndDate: 'End Date',
        actionLoadMore: 'Load More',
        periodToday: 'Today',
        periodWeek: 'Week',
        periodMonth: 'Month',

        // Pricing types
        pricingFixed: 'Fixed',
        pricingUnknown: 'Quote',
        currencySom: ' som',
        priceBase: ' (Base)',

        // Urgency levels
        urgencyEmergency: 'Emergency',
        urgencyUrgent: 'Urgent',
        urgencyPlanned: 'Planned',

        // Order statuses
        statusPlaced: 'New',
        statusClaimed: 'Claimed',
        statusStarted: 'In Progress',
        statusCompleted: 'Completed',
        statusConfirmed: 'Confirmed',
        statusCanceled: 'Canceled',

        // Card labels
        cardLocation: 'Location',
        cardClient: 'Client',
        cardPhone: 'Phone',
        cardGuaranteed: 'Guaranteed',
        cardOffered: 'Offered',
        cardStartToSeeAddress: 'Start job to see address',
        cardPendingApproval: 'Awaiting confirmation...',

        // Actions
        actionClaim: 'Claim Order',
        actionStart: 'Start Job',
        actionComplete: 'Complete',
        actionCancel: 'Cannot Complete',
        actionProcessing: 'Processing...',
        actionLocked: 'Verification Required',
        actionSubmit: 'Submit',
        actionConfirm: 'Confirm',
        actionBack: 'Back',

        // Finances
        finTotalEarned: 'Total Earned',
        finNetBalance: 'Net Balance',
        finCommissionOwed: 'Commission Owed',
        finCommissionPaid: 'Commission Paid',
        finJobsDone: 'Jobs Completed',
        finRecentHistory: 'Recent Earnings',
        finNoRecords: 'No earnings yet',
        finPending: 'Pending',
        finPaid: 'Paid',

        // Modals
        modalCompleteTitle: 'Complete Job',
        modalFinalPrice: 'Final Price (сом)',
        modalWorkPerformed: 'Work Performed',
        modalHoursWorked: 'Hours Worked',
        modalCancelTitle: 'Cannot Complete Job',
        modalSelectReason: 'Please select a reason:',
        modalAdditionalNotes: 'Additional Notes',

        // Empty states
        emptyPoolTitle: 'No Available Orders',
        emptyPoolDesc: 'Pull down to refresh',
        emptyJobsTitle: 'No Active Jobs',
        emptyJobsDesc: 'Claim orders from the pool',
        emptyFilterTitle: 'No Matches',
        emptyFilterDesc: 'Try adjusting your filters',

        // Cancel reasons (aligned with DB)
        reasonScopeMismatch: 'Scope Mismatch',
        reasonClientUnavailable: 'Client Unavailable',
        reasonSafetyRisk: 'Safety Risk',
        reasonToolsMissing: 'Tools Missing',
        reasonMaterialsUnavailable: 'Materials Unavailable',
        reasonAddressUnreachable: 'Address Unreachable',
        reasonClientRequest: 'Client Request',
        reasonOther: 'Other',

        // Services
        servicePlumbing: 'Plumbing',
        serviceCleaning: 'Cleaning',
        serviceConstruction: 'Construction',
        serviceCarpenter: 'Carpenter',
        serviceElectrician: 'Electrician',
        servicePainting: 'Painting',
        serviceOther: 'Other',

        // Loading
        loading: 'Loading...',
        refreshing: 'Refreshing...',
    },

    ru: {
        // Header
        verified: 'Подтвержден',
        unverified: 'Не подтвержден',
        logout: 'Выход',
        confirmLogout: 'Вы уверены, что хотите выйти?',

        // Tabs
        tabPool: 'Доступные',
        tabJobs: 'Мои заказы',
        tabFinances: 'Финансы',

        // Filters
        filterLabel: 'Фильтр',
        filterUrgency: 'Срочность',
        filterService: 'Услуга',
        filterArea: 'Район',
        filterPrice: 'Цена',
        filterClear: 'Сброс',
        filterAll: 'Все',
        filterCustom: 'Период',
        labelStartDate: 'Начало',
        labelEndDate: 'Конец',
        actionLoadMore: 'Загрузить еще',
        periodToday: 'Сегодня',
        periodWeek: 'Неделя',
        periodMonth: 'Месяц',

        // Pricing types
        pricingFixed: 'Фикс.',
        pricingUnknown: 'По договор.',
        currencySom: ' сом',
        priceBase: ' (База)',

        // Urgency levels
        urgencyEmergency: 'Авария',
        urgencyUrgent: 'Срочно',
        urgencyPlanned: 'Плановый',

        // Order statuses
        statusPlaced: 'Новый',
        statusClaimed: 'Принят',
        statusStarted: 'В работе',
        statusCompleted: 'Выполнен',
        statusConfirmed: 'Подтвержден',
        statusCanceled: 'Отменен',

        // Card labels
        cardLocation: 'Адрес',
        cardClient: 'Клиент',
        cardPhone: 'Телефон',
        cardGuaranteed: 'Гарантировано',
        cardOffered: 'Предложено',
        cardStartToSeeAddress: 'Начните работу для адреса',
        cardPendingApproval: 'Ожидает подтверждения...',

        // Actions
        actionClaim: 'Взять заказ',
        actionStart: 'Начать',
        actionComplete: 'Завершить',
        actionCancel: 'Не могу выполнить',
        actionProcessing: 'Обработка...',
        actionLocked: 'Требуется верификация',
        actionSubmit: 'Отправить',
        actionConfirm: 'Подтвердить',
        actionBack: 'Назад',

        // Finances
        finTotalEarned: 'Заработано',
        finNetBalance: 'Чистый доход',
        finCommissionOwed: 'Комиссия к оплате',
        finCommissionPaid: 'Комиссия оплачена',
        finJobsDone: 'Выполнено заказов',
        finRecentHistory: 'Последние доходы',
        finNoRecords: 'Пока нет доходов',
        finPending: 'Ожидает',
        finPaid: 'Оплачено',

        // Modals
        modalCompleteTitle: 'Завершение заказа',
        modalFinalPrice: 'Итоговая цена (сом)',
        modalWorkPerformed: 'Выполненные работы',
        modalHoursWorked: 'Часов работы',
        modalCancelTitle: 'Отмена заказа',
        modalSelectReason: 'Выберите причину:',
        modalAdditionalNotes: 'Дополнительные заметки',

        // Empty states
        emptyPoolTitle: 'Нет доступных заказов',
        emptyPoolDesc: 'Потяните вниз для обновления',
        emptyJobsTitle: 'Нет активных заказов',
        emptyJobsDesc: 'Возьмите заказ из пула',
        emptyFilterTitle: 'Ничего не найдено',
        emptyFilterDesc: 'Попробуйте изменить фильтры',

        // Cancel reasons
        reasonScopeMismatch: 'Несоответствие объема',
        reasonClientUnavailable: 'Клиент недоступен',
        reasonSafetyRisk: 'Риск безопасности',
        reasonToolsMissing: 'Нет инструментов',
        reasonMaterialsUnavailable: 'Нет материалов',
        reasonAddressUnreachable: 'Адрес недоступен',
        reasonClientRequest: 'Просьба клиента',
        reasonOther: 'Другое',

        // Services
        servicePlumbing: 'Сантехника',
        serviceCleaning: 'Клининг',
        serviceConstruction: 'Строительство',
        serviceCarpenter: 'Плотник',
        serviceElectrician: 'Электрик',
        servicePainting: 'Малярные работы',
        serviceOther: 'Другое',

        // Loading
        loading: 'Загрузка...',
        refreshing: 'Обновление...',
    },

    kg: {
        // Header
        verified: 'Тастыкталган',
        unverified: 'Тастыкталбаган',
        logout: 'Чыгуу',
        confirmLogout: 'Чыгууну каалайсызбы?',

        // Tabs
        tabPool: 'Жеткиликтүү',
        tabJobs: 'Менин иштерим',
        tabFinances: 'Каржы',

        // Filters
        filterLabel: 'Фильтр',
        filterUrgency: 'Шашылыштык',
        filterService: 'Кызмат',
        filterArea: 'Район',
        filterPrice: 'Баа',
        filterClear: 'Тазалоо',
        filterAll: 'Баары',
        filterCustom: 'Мезгил',
        labelStartDate: 'Башы',
        labelEndDate: 'Аягы',
        actionLoadMore: 'Дагы жүктөө',
        periodToday: 'Бүгүн',
        periodWeek: 'Апта',
        periodMonth: 'Ай',

        // Pricing types
        pricingFixed: 'Фикс.',
        pricingUnknown: 'Келишим',
        currencySom: ' сом',
        priceBase: ' (База)',

        // Urgency levels
        urgencyEmergency: 'Өзгөчө',
        urgencyUrgent: 'Шашылыш',
        urgencyPlanned: 'Пландуу',

        // Order statuses
        statusPlaced: 'Жаңы',
        statusClaimed: 'Алынды',
        statusStarted: 'Иште',
        statusCompleted: 'Аяктады',
        statusConfirmed: 'Тастыкталды',
        statusCanceled: 'Жокко чыгарылды',

        // Card labels
        cardLocation: 'Дарек',
        cardClient: 'Кардар',
        cardPhone: 'Телефон',
        cardGuaranteed: 'Кепилдик',
        cardOffered: 'Сунушталган',
        cardStartToSeeAddress: 'Даректи көрүү үчүн баштаңыз',
        cardPendingApproval: 'Тастыктоо күтүлүүдө...',

        // Actions
        actionClaim: 'Алуу',
        actionStart: 'Баштоо',
        actionComplete: 'Аяктоо',
        actionCancel: 'Аткара албайм',
        actionProcessing: 'Иштетилүүдө...',
        actionLocked: 'Текшерүү талап кылынат',
        actionSubmit: 'Жөнөтүү',
        actionConfirm: 'Тастыктоо',
        actionBack: 'Артка',

        // Finances
        finTotalEarned: 'Жалпы киреше',
        finNetBalance: 'Таза киреше',
        finCommissionOwed: 'Комиссия карызы',
        finCommissionPaid: 'Комиссия төлөндү',
        finJobsDone: 'Аткарылган иштер',
        finRecentHistory: 'Акыркы киреше',
        finNoRecords: 'Азырынча киреше жок',
        finPending: 'Күтүлүүдө',
        finPaid: 'Төлөндү',

        // Modals
        modalCompleteTitle: 'Ишти аяктоо',
        modalFinalPrice: 'Акыркы баа (сом)',
        modalWorkPerformed: 'Аткарылган иш',
        modalHoursWorked: 'Иштеген саат',
        modalCancelTitle: 'Ишти жокко чыгаруу',
        modalSelectReason: 'Себеп тандаңыз:',
        modalAdditionalNotes: 'Кошумча жазуулар',

        // Empty states
        emptyPoolTitle: 'Буйрутма жок',
        emptyPoolDesc: 'Жаңыртуу үчүн ылдый тартыңыз',
        emptyJobsTitle: 'Активдүү иш жок',
        emptyJobsDesc: 'Бассейнден буйрутма алыңыз',
        emptyFilterTitle: 'Эч нерсе табылган жок',
        emptyFilterDesc: 'Фильтрлерди өзгөртүп көрүңүз',

        // Cancel reasons
        reasonScopeMismatch: 'Көлөм дал келбейт',
        reasonClientUnavailable: 'Кардар жеткиликсиз',
        reasonSafetyRisk: 'Коопсуздук коркунучу',
        reasonToolsMissing: 'Аспаптар жок',
        reasonMaterialsUnavailable: 'Материалдар жок',
        reasonAddressUnreachable: 'Дарекке жетүү кыйын',
        reasonClientRequest: 'Кардардын суроосу',
        reasonOther: 'Башка',

        // Services
        servicePlumbing: 'Сантехника',
        serviceCleaning: 'Тазалоо',
        serviceConstruction: 'Курулуш',
        serviceCarpenter: 'Жыгач уста',
        serviceElectrician: 'Электрик',
        servicePainting: 'Сырдоо',
        serviceOther: 'Башка',

        // Loading
        loading: 'Жүктөлүүдө...',
        refreshing: 'Жаңыртылууда...',
    },
};

const STORAGE_KEY = '@plumberhub_language';

const LocalizationContext = createContext(null);

export const LocalizationProvider = ({ children }) => {
    const [language, setLanguageState] = useState('en');

    // Load saved language on mount
    React.useEffect(() => {
        const loadLanguage = async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved && translations[saved]) {
                    setLanguageState(saved);
                }
            } catch (error) {
                console.warn('Failed to load language preference:', error);
            }
        };
        loadLanguage();
    }, []);

    // Set language and persist
    const setLanguage = useCallback(async (lang) => {
        if (translations[lang]) {
            setLanguageState(lang);
            try {
                await AsyncStorage.setItem(STORAGE_KEY, lang);
            } catch (error) {
                console.warn('Failed to save language preference:', error);
            }
        }
    }, []);

    // Cycle to next language
    const cycleLanguage = useCallback(() => {
        const langs = Object.keys(LANGUAGES);
        const currentIndex = langs.indexOf(language);
        const nextIndex = (currentIndex + 1) % langs.length;
        setLanguage(langs[nextIndex]);
    }, [language, setLanguage]);

    // Translation function
    const t = useCallback((key) => {
        return translations[language]?.[key] || translations.en?.[key] || key;
    }, [language]);

    const value = {
        language,
        setLanguage,
        cycleLanguage,
        t,
        languages: LANGUAGES,
    };

    return (
        <LocalizationContext.Provider value={value}>
            {children}
        </LocalizationContext.Provider>
    );
};

export const useLocalization = () => {
    const context = useContext(LocalizationContext);
    if (!context) {
        throw new Error('useLocalization must be used within a LocalizationProvider');
    }
    return context;
};

export default LocalizationContext;
