import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const translations = {
    en: {
        // General
        welcome: "Welcome",
        loading: "Loading...",
        cancel: "Cancel",
        save: "Save",
        clear: "Clear",
        confirm: "Confirm",
        close: "Close",
        back: "Back",
        next: "Next",
        ok: "OK",
        yes: "Yes",
        no: "No",
        search: "Search...",
        noResults: "No results found",
        retry: "Retry",
        refresh: "Refresh",

        // Auth & User
        verified: "Verified",
        unverified: "Unverified",
        online: "Online",
        offline: "Offline",
        logout: "Logout",
        logoutConfirm: "Are you sure you want to logout?",

        // Tabs & Navigation
        tabOrders: "Orders",
        tabMyAccount: "My Account",
        tabCreate: "Create",
        tabQueue: "Queue",
        tabOverview: "Overview",
        tabPeople: "People",
        tabSettings: "Settings",

        // Dashboard Sections
        sectionAvailable: "Available Orders",
        sectionMyJobs: "My Jobs",
        sectionEarnings: "Earnings",
        sectionHistory: "History",
        sectionProfile: "Profile",
        sectionClient: "Client",
        sectionMaster: "Master",
        sectionDetails: "Order Details",
        sectionFinancials: "Financials",
        sectionNote: "Internal Note",

        // Filters
        filterUrgency: "Urgency",
        filterService: "Service",
        filterArea: "Area",
        filterAll: "All",
        filterStatus: "Status",
        filterSort: "Sort",
        filterNewestFirst: "Newest First",
        filterOldestFirst: "Oldest First",
        filterAllOrders: "All Orders",
        filterMyOrders: "My Orders",
        filterAllUrgency: "All Urgency",
        hideFilters: "Hide Filters",
        showFilters: "Show Filters",

        // Admin
        adminTitle: "Admin Pro",
        peopleMasters: "Masters",
        peopleDispatchers: "Dispatchers",
        settingsTitle: "Platform Settings",
        basePayout: "Base Payout",
        commissionRate: "Commission Rate",
        priceDeviation: "Price Deviation",
        autoClaimTimeout: "Auto-Claim Timeout",
        orderExpiry: "Order Expiry",
        serviceTypes: "Service Types",
        addType: "Add Type",
        revenueTrend: "Revenue Trend",
        commissionCollection: "Commission Collection",

        // Service Types
        servicePlumbing: "Plumbing",
        serviceElectrician: "Electrician",
        serviceCleaning: "Cleaning",
        serviceCarpenter: "Carpenter",
        serviceRepair: "Repair",
        serviceInstallation: "Installation",
        serviceMaintenance: "Maintenance",
        serviceOther: "Other",
        serviceApplianceRepair: "Appliance Repair",
        serviceBuilding: "Building",
        serviceInspection: "Inspection",
        serviceHvac: "HVAC",
        servicePainting: "Painting",
        serviceFlooring: "Flooring",
        serviceRoofing: "Roofing",
        serviceLandscaping: "Landscaping",

        // Urgency
        urgencyEmergency: "Emergency",
        urgencyUrgent: "Urgent",
        urgencyPlanned: "Planned",

        // Status
        statusPlaced: "Placed",
        statusClaimed: "Claimed",
        statusStarted: "Started",
        statusCompleted: "Completed",
        statusConfirmed: "Confirmed",
        statusCanceled: "Canceled",
        statusReopened: "Reopened",
        statusExpired: "Expired",
        statusActive: "Active",
        statusPayment: "Awaiting Payment",
        statusDisputed: "Disputed",
        statusAll: "All Orders",

        // Actions
        actionClaim: "Claim",
        actionLocked: "Locked",
        actionStart: "Start Job",
        actionCancel: "Refuse",
        actionComplete: "Complete",
        actionBack: "Back",
        actionSubmit: "Submit",
        actionEdit: "Edit",
        actionSave: "Save",
        actionDelete: "Delete",
        actionAssign: "Assign",
        actionReopen: "Reopen",
        actionPay: "Pay",
        actionCall: "Call",
        actionCopy: "Copy",

        // Cards
        cardStartToSeeAddress: "Start job to see address",
        cardPendingApproval: "Pending Approval",
        cardUnassigned: "Unassigned",
        cardStuck: "Stuck",

        // Order Details
        clientName: "Client Name",
        clientPhone: "Client Phone",
        address: "Address",
        fullAddress: "Full Address",
        district: "District",
        description: "Description",
        problemDescription: "Problem Description",
        serviceType: "Service Type",
        price: "Price",
        initialPrice: "Initial Price",
        finalPrice: "Final Price",
        calloutFee: "Call-out Fee",
        fixedPrice: "Fixed Price",
        priceOpen: "Open",
        priceBase: "base",
        currencySom: "som",

        // Financials
        prepaidBalance: "Balance",
        balanceBlocked: "Balance Blocked",
        initialDeposit: "Initial Deposit",
        threshold: "Threshold",
        finNetBalance: "Net Balance",
        finTotalEarned: "Total Earned",
        finCommissionPaid: "Commission Paid",
        finCommissionOwed: "Commission Owed",
        finJobsDone: "Jobs Done",
        finPaid: "Paid",
        finPending: "Pending",
        debt: "Debt",

        // Profile
        rating: "Rating",
        completed: "Completed",
        refused: "Refused",
        professionalInfo: "Professional Info",
        serviceArea: "Service Area",
        license: "License",
        experience: "Experience",
        years: "years",
        specializations: "Specializations",
        jobs: "jobs",

        // Periods
        periodAll: "All Time",
        periodMonth: "Month",
        periodWeek: "Week",
        periodToday: "Today",

        // Schedule
        schedule: "Schedule",
        preferredDate: "Preferred Date",
        preferredTime: "Preferred Time",
        dateToday: "Today",
        dateTomorrow: "Tomorrow",
        timeMorning: "Morning",
        timeAfternoon: "Afternoon",
        timeEvening: "Evening",

        // Pricing
        pricing: "Pricing",
        pricingMasterQuotes: "Master Quotes",
        pricingFixed: "Fixed Price",

        // Modals
        modalCompleteTitle: "Complete Job",
        modalFinalPrice: "Final Price",
        modalWorkPerformed: "Work Performed",
        modalHoursWorked: "Hours Worked",
        modalCancelTitle: "Refuse Job",
        modalSelectReason: "Select Reason",
        modalAdditionalNotes: "Additional Notes",
        modalOrderPrefix: "Order #",
        modalPaymentTitle: "Confirm Payment",
        modalSelectMaster: "Select Master",
        modalAssignTitle: "Assign Master",
        modalAssignMsg: "Assign {0} to this order?",

        // Payment
        paymentAmount: "Amount",
        paymentProof: "Proof URL",
        paymentMethod: "Payment Method",
        paymentCash: "Cash",
        paymentTransfer: "Transfer",
        paymentCard: "Card",

        // Badges
        badgeDispute: "Dispute",
        badgeUnpaid: "Unpaid",
        badgeStuck: "Stuck",

        // Issues
        issueAllIssues: "All Issues",
        issueStuck: "Stuck",
        issueDisputed: "Disputed",
        issueUnpaid: "Unpaid",
        issueCanceled: "Canceled",

        // Time Units
        timeUnitNow: "Just now",
        timeUnitMins: "m ago",
        timeUnitHours: "h ago",
        timeUnitDays: "d ago",

        // Toasts & Alerts
        toastCopied: "Copied!",
        toastUpdated: "Updated",
        toastPaymentConfirmed: "Payment confirmed!",
        toastMasterAssigned: "Master assigned!",
        toastOrderCreated: "Order created!",
        toastFillRequired: "Please fill required fields",
        toastFixPhone: "Fix phone format",
        toastConfirmDetails: "Please confirm details",
        toastSelectPaymentMethod: "Select payment method",
        toastProofRequired: "Proof required for transfers",
        toastNoOrderSelected: "No order selected",
        toastFormCleared: "Form cleared",
        toastAssignFail: "Assignment failed",
        toastCreateFailed: "Create failed",
        toastFailedPrefix: "Failed: ",
        alertLogoutTitle: "Logout",
        alertLogoutMsg: "Are you sure?",
        alertLogoutBtn: "Logout",
        alertCancelTitle: "Cancel Order",
        alertCancelMsg: "Are you sure?",
        alertAssignBtn: "Assign",

        // Errors
        errorPhoneFormat: "Invalid format (+996...)",
        errorGeneric: "Something went wrong",
        errorNetwork: "Network error",
        errorLoadFailed: "Failed to load data",

        // Create Order
        createOrder: "Create Order",
        createClientDetails: "Client Details",
        createPhone: "Phone",
        createName: "Name",
        createLocation: "Location",
        createDistrict: "District",
        createFullAddress: "Full Address",
        createServiceType: "Service Type",
        createProblemDesc: "Problem Description",
        createPrice: "Price",
        createInternalNote: "Internal Note",
        createConfirm: "Confirm Details",
        createClear: "Clear",
        createPublish: "Publish Order",
        createAnother: "Create Another",
        createSuccess: "Order Created!",
        createViewQueue: "View in Queue",
        createAnotherOrder: "Create Another Order",

        // Labels
        labelCallout: "Call-out:",
        labelInitial: "Initial:",
        labelFinal: "Final:",
        labelAmount: "Amount:",
        labelProof: "Proof URL",
        labelRating: "Rating",
        labelJobs: "jobs",
        labelMasterPrefix: "Master: ",
        labelAllServices: "All Services",

        // Buttons
        btnEdit: "Edit",
        btnCancelEdit: "Cancel Edit",
        btnClose: "Close",
        btnPay: "Pay",
        btnCopy: "Copy",
        btnCall: "Call",
        btnSaveChanges: "Save Changes",
        btnPayWithAmount: "Pay {0}c",
        btnSortNewest: "↓ Newest",
        btnSortOldest: "↑ Oldest",

        // Recent & Other
        recentBtn: "Recent",
        needsAttention: "Needs Attention",
        needsAttentionSort: "Sort",
        noMasters: "No available masters",
        msgNoMatch: "No items match filter",
        emptyList: "No orders found",
        ordersQueue: "Orders Queue",
        showFilters: "Show Filters",
        hideFilters: "Hide Filters",
        selectOption: "Select Option",
        keepLocation: "Keep Location",
        startFresh: "Start Fresh",

        // Misc Placeholders
        districtPlaceholder: "e.g. Leninsky",
        addressPlaceholder: "Full Address",

        // Empty States
        emptyPoolTitle: "No available orders",
        emptyJobsTitle: "No active jobs",
        noOrderHistory: "No order history",

        // Drawer
        drawerTitle: "Order #{0}",
    },
    ru: {
        // General
        welcome: "Добро пожаловать",
        loading: "Загрузка...",
        cancel: "Отмена",
        save: "Сохранить",
        clear: "Очистить",
        confirm: "Подтвердить",
        close: "Закрыть",
        back: "Назад",
        next: "Далее",
        ok: "OK",
        yes: "Да",
        no: "Нет",
        search: "Поиск...",
        noResults: "Ничего не найдено",
        retry: "Повторить",
        refresh: "Обновить",

        // Auth & User
        verified: "Подтвержден",
        unverified: "Не подтвержден",
        online: "В сети",
        offline: "Не в сети",
        logout: "Выход",
        logoutConfirm: "Вы уверены, что хотите выйти?",

        logoutConfirm: "Вы уверены, что хотите выйти?",

        // Tabs & Navigation
        tabOrders: "Заказы",
        tabMyAccount: "Мой аккаунт",
        tabCreate: "Создать",
        tabQueue: "Очередь",
        tabOverview: "Обзор",
        tabPeople: "Люди",
        tabSettings: "Настройки",

        // Dashboard Sections
        sectionAvailable: "Доступные заказы",
        sectionMyJobs: "Мои работы",
        sectionEarnings: "Доходы",
        sectionHistory: "История",
        sectionProfile: "Профиль",
        sectionClient: "Клиент",
        sectionMaster: "Мастер",
        sectionDetails: "Детали заказа",
        sectionFinancials: "Финансы",
        sectionNote: "Внутренняя заметка",

        // Filters
        filterUrgency: "Срочность",
        filterService: "Услуга",
        filterArea: "Район",
        filterAll: "Все",
        filterStatus: "Статус",
        filterSort: "Сортировка",
        filterNewestFirst: "Сначала новые",
        filterOldestFirst: "Сначала старые",
        filterAllOrders: "Все заказы",
        filterMyOrders: "Мои заказы",
        filterAllUrgency: "Любая срочность",
        hideFilters: "Скрыть фильтры",
        showFilters: "Показать фильтры",

        // Admin
        adminTitle: "Админ Про",
        peopleMasters: "Мастера",
        peopleDispatchers: "Диспетчеры",
        settingsTitle: "Настройки Платформы",
        basePayout: "Базовая Выплата",
        commissionRate: "Ставка Комиссии",
        priceDeviation: "Отклонение Цены",
        autoClaimTimeout: "Таймаут Авто-Принятия",
        orderExpiry: "Срок Заказа",
        serviceTypes: "Типы Услуг",
        addType: "Добавить Тип",
        revenueTrend: "Тренд Выручки",
        commissionCollection: "Сбор Комиссии",

        // Service Types
        servicePlumbing: "Сантехника",
        serviceElectrician: "Электрик",
        serviceCleaning: "Уборка",
        serviceCarpenter: "Плотник",
        serviceRepair: "Ремонт",
        serviceInstallation: "Установка",
        serviceMaintenance: "Обслуживание",
        serviceOther: "Другое",
        serviceApplianceRepair: "Ремонт техники",
        serviceBuilding: "Строительство",
        serviceInspection: "Осмотр",
        serviceHvac: "Кондиционеры",
        servicePainting: "Покраска",
        serviceFlooring: "Полы",
        serviceRoofing: "Кровля",
        serviceLandscaping: "Ландшафт",

        // Urgency
        urgencyEmergency: "Аварийный",
        urgencyUrgent: "Срочный",
        urgencyPlanned: "Плановый",

        // Status
        statusPlaced: "Размещен",
        statusClaimed: "Принят",
        statusStarted: "Начат",
        statusCompleted: "Завершен",
        statusConfirmed: "Подтвержден",
        statusCanceled: "Отменен",
        statusReopened: "Переоткрыт",
        statusExpired: "Истек",
        statusActive: "Активные",
        statusPayment: "Ожидает оплаты",
        statusDisputed: "Спорные",
        statusAll: "Все заказы",

        // Actions
        actionClaim: "Взять",
        actionLocked: "Заблокировано",
        actionStart: "Начать",
        actionCancel: "Отказаться",
        actionComplete: "Завершить",
        actionBack: "Назад",
        actionSubmit: "Отправить",
        actionEdit: "Изменить",
        actionSave: "Сохранить",
        actionDelete: "Удалить",
        actionAssign: "Назначить",
        actionReopen: "Переоткрыть",
        actionPay: "Оплатить",
        actionCall: "Звонок",
        actionCopy: "Копия",

        // Cards
        cardStartToSeeAddress: "Начните, чтобы увидеть адрес",
        cardPendingApproval: "Ожидает подтверждения",
        cardUnassigned: "Не назначен",
        cardStuck: "Застрял",

        // Order Details
        clientName: "Имя клиента",
        clientPhone: "Телефон клиента",
        address: "Адрес",
        fullAddress: "Полный адрес",
        district: "Район",
        description: "Описание",
        problemDescription: "Описание проблемы",
        serviceType: "Тип услуги",
        price: "Цена",
        initialPrice: "Начальная цена",
        finalPrice: "Итоговая цена",
        calloutFee: "Плата за выезд",
        fixedPrice: "Фикс. цена",
        priceOpen: "Открыто",
        priceBase: "фикс",
        currencySom: "сом",

        // Financials
        prepaidBalance: "Баланс",
        balanceBlocked: "Баланс заблокирован",
        initialDeposit: "Начальный депозит",
        threshold: "Порог",
        finNetBalance: "Чистый баланс",
        finTotalEarned: "Всего заработано",
        finCommissionPaid: "Комиссия оплачена",
        finCommissionOwed: "Комиссия к оплате",
        finJobsDone: "Выполнено работ",
        finPaid: "Оплачено",
        finPending: "Ожидает",
        debt: "Долг",

        // Profile
        rating: "Рейтинг",
        completed: "Завершено",
        refused: "Отказов",
        professionalInfo: "Проф. информация",
        serviceArea: "Район обслуживания",
        license: "Лицензия",
        experience: "Опыт",
        years: "лет",
        specializations: "Специализации",
        jobs: "заказов",

        // Periods
        periodAll: "Все время",
        periodMonth: "Месяц",
        periodWeek: "Неделя",
        periodToday: "Сегодня",

        // Schedule
        schedule: "Расписание",
        preferredDate: "Желаемая дата",
        preferredTime: "Желаемое время",
        dateToday: "Сегодня",
        dateTomorrow: "Завтра",
        timeMorning: "Утро",
        timeAfternoon: "День",
        timeEvening: "Вечер",

        // Pricing
        pricing: "Цена",
        pricingMasterQuotes: "Оценка мастера",
        pricingFixed: "Фикс. цена",

        // Modals
        modalCompleteTitle: "Завершение работы",
        modalFinalPrice: "Итоговая цена",
        modalWorkPerformed: "Выполненные работы",
        modalHoursWorked: "Затрачено часов",
        modalCancelTitle: "Отказ от работы",
        modalSelectReason: "Выберите причину",
        modalAdditionalNotes: "Дополнительные заметки",
        modalOrderPrefix: "Заказ #",
        modalPaymentTitle: "Подтвердить оплату",
        modalSelectMaster: "Выберите мастера",
        modalAssignTitle: "Назначить мастера",
        modalAssignMsg: "Назначить {0} на этот заказ?",

        // Payment
        paymentAmount: "Сумма",
        paymentProof: "Ссылка на чек",
        paymentMethod: "Способ оплаты",
        paymentCash: "Наличные",
        paymentTransfer: "Перевод",
        paymentCard: "Карта",

        // Badges
        badgeDispute: "Спор",
        badgeUnpaid: "Не оплачен",
        badgeStuck: "Застрял",

        // Issues
        issueAllIssues: "Все вопросы",
        issueStuck: "Застрял",
        issueDisputed: "Спорный",
        issueUnpaid: "Не оплачен",
        issueCanceled: "Отменен",

        // Time Units
        timeUnitNow: "Только что",
        timeUnitMins: " м назад",
        timeUnitHours: " ч назад",
        timeUnitDays: " д назад",

        // Toasts & Alerts
        toastCopied: "Скопировано!",
        toastUpdated: "Обновлено",
        toastPaymentConfirmed: "Оплата подтверждена!",
        toastMasterAssigned: "Мастер назначен!",
        toastOrderCreated: "Заказ создан!",
        toastFillRequired: "Заполните обязательные поля",
        toastFixPhone: "Исправьте формат телефона",
        toastConfirmDetails: "Подтвердите детали",
        toastSelectPaymentMethod: "Выберите способ оплаты",
        toastProofRequired: "Нужен чек перевода",
        toastNoOrderSelected: "Заказ не выбран",
        toastFormCleared: "Форма очищена",
        toastAssignFail: "Ошибка назначения",
        toastCreateFailed: "Ошибка создания",
        toastFailedPrefix: "Ошибка: ",
        alertLogoutTitle: "Выход",
        alertLogoutMsg: "Вы уверены?",
        alertLogoutBtn: "Выход",
        alertCancelTitle: "Отменить заказ",
        alertCancelMsg: "Вы уверены?",
        alertAssignBtn: "Назначить",

        // Errors
        errorPhoneFormat: "Неверный формат (+996...)",
        errorGeneric: "Что-то пошло не так",
        errorNetwork: "Ошибка сети",
        errorLoadFailed: "Не удалось загрузить данные",

        // Create Order
        createOrder: "Создать заказ",
        createClientDetails: "Данные клиента",
        createPhone: "Телефон",
        createName: "Имя",
        createLocation: "Локация",
        createDistrict: "Район",
        createFullAddress: "Полный адрес",
        createServiceType: "Тип услуги",
        createProblemDesc: "Описание проблемы",
        createPrice: "Цена",
        createInternalNote: "Внутренняя заметка",
        createConfirm: "Подтвердить детали",
        createClear: "Очистить",
        createPublish: "Опубликовать",
        createAnother: "Создать еще",
        createSuccess: "Заказ создан!",
        createViewQueue: "Посмотреть в очереди",
        createAnotherOrder: "Создать еще заказ",

        // Labels
        labelCallout: "Выезд:",
        labelInitial: "Начальная:",
        labelFinal: "Итоговая:",
        labelAmount: "Сумма:",
        labelProof: "Ссылка на чек",
        labelRating: "Рейтинг",
        labelJobs: "заказов",
        labelMasterPrefix: "Мастер: ",
        labelAllServices: "Все услуги",

        // Buttons
        btnEdit: "Изменить",
        btnCancelEdit: "Отмена",
        btnClose: "Закрыть",
        btnPay: "Оплатить",
        btnCopy: "Копия",
        btnCall: "Звонок",
        btnSaveChanges: "Сохранить",
        btnPayWithAmount: "Оплатить {0}c",
        btnSortNewest: "↓ Новые",
        btnSortOldest: "↑ Старые",

        // Recent & Other
        recentBtn: "Недавние",
        needsAttention: "Требует внимания",
        needsAttentionSort: "Сорт.",
        noMasters: "Нет доступных мастеров",
        msgNoMatch: "Нет результатов",
        emptyList: "Заказов не найдено",
        ordersQueue: "Очередь заказов",
        showFilters: "Показать фильтры",
        hideFilters: "Скрыть фильтры",
        selectOption: "Выберите",
        keepLocation: "Оставить адрес",
        startFresh: "Начать заново",

        // Misc Placeholders
        districtPlaceholder: "напр. Ленинский",
        addressPlaceholder: "Полный адрес",

        // Empty States
        emptyPoolTitle: "Нет доступных заказов",
        emptyJobsTitle: "Нет активных работ",
        noOrderHistory: "История заказов пуста",

        // Drawer
        drawerTitle: "Заказ #{0}",
    },
    kg: {
        // General
        welcome: "Кош келиңиз",
        loading: "Жүктөлүүдө...",
        cancel: "Жокко чыгаруу",
        save: "Сактоо",
        clear: "Тазалоо",
        confirm: "Ырастоо",
        close: "Жабуу",
        back: "Артка",
        next: "Кийинки",
        ok: "OK",
        yes: "Ооба",
        no: "Жок",
        search: "Издөө...",
        noResults: "Эч нерсе табылган жок",
        retry: "Кайталоо",
        refresh: "Жаңылоо",

        // Auth & User
        verified: "Текшерилген",
        unverified: "Текшерилбеген",
        online: "Онлайн",
        offline: "Офлайн",
        logout: "Чыгуу",
        logoutConfirm: "Чыгууну каалайсызбы?",

        // Tabs & Navigation
        tabOrders: "Буйрутмалар",
        tabMyAccount: "Менин аккаунтум",
        tabCreate: "Жаңы түзүү",
        tabQueue: "Кезек",
        tabOverview: "Сереп",
        tabPeople: "Адамдар",
        tabSettings: "Жөндөөлөр",

        // Dashboard Sections
        sectionAvailable: "Жеткиликтүү буйрутмалар",
        sectionMyJobs: "Менин иштерим",
        sectionEarnings: "Кирешелер",
        sectionHistory: "Тарых",
        sectionProfile: "Профиль",
        sectionClient: "Кардар",
        sectionMaster: "Уста",
        sectionDetails: "Буйрутма чоо-жайы",
        sectionFinancials: "Финансы",
        sectionNote: "Ички белги",

        // Filters
        filterUrgency: "Шашылыш",
        filterService: "Кызмат",
        filterArea: "Район",
        filterAll: "Бардыгы",
        filterStatus: "Статус",
        filterSort: "Реттөө",
        filterNewestFirst: "Жаңылар биринчи",
        filterOldestFirst: "Эскилер биринчи",
        filterAllOrders: "Бардык буйрутмалар",
        filterMyOrders: "Менин буйрутмаларым",
        filterAllUrgency: "Бардык шашылыштык",
        hideFilters: "Фильтрлөрдү жашыруу",
        showFilters: "Фильтрлөрдү көрсөтүү",

        // Admin
        adminTitle: "Админ Про",
        peopleMasters: "Усталар",
        peopleDispatchers: "Диспетчерлер",
        settingsTitle: "Платформа Жөндөөлөрү",
        basePayout: "Базалык Төлөм",
        commissionRate: "Комиссия",
        priceDeviation: "Баанын Өзгөрүшү",
        autoClaimTimeout: "Авто-Алуу Убактысы",
        orderExpiry: "Буйрутма Мөөнөтү",
        serviceTypes: "Кызмат Түрлөрү",
        addType: "Түр Кошуу",
        revenueTrend: "Киреше Тренди",
        commissionCollection: "Комиссия Чогултуу",

        // Service Types
        servicePlumbing: "Сантехника",
        serviceElectrician: "Электрик",
        serviceCleaning: "Тазалоо",
        serviceCarpenter: "Уста",
        serviceRepair: "Оңдоо",
        serviceInstallation: "Орнотуу",
        serviceMaintenance: "Тейлөө",
        serviceOther: "Башка",
        serviceApplianceRepair: "Техника оңдоо",
        serviceBuilding: "Курулуш",
        serviceInspection: "Текшерүү",
        serviceHvac: "Кондиционер",
        servicePainting: "Боёк",
        serviceFlooring: "Пол",
        serviceRoofing: "Чатыр",
        serviceLandscaping: "Ландшафт",

        // Urgency
        urgencyEmergency: "Авариялык",
        urgencyUrgent: "Шашылыш",
        urgencyPlanned: "Пландалган",

        // Status
        statusPlaced: "Жайгаштырылды",
        statusClaimed: "Кабыл алынды",
        statusStarted: "Башталды",
        statusCompleted: "Аяктады",
        statusConfirmed: "Тастыкталды",
        statusCanceled: "Жокко чыгарылды",
        statusReopened: "Кайра ачылган",
        statusExpired: "Мөөнөтү бүткөн",
        statusActive: "Активдүү",
        statusPayment: "Төлөм күтүүдө",
        statusDisputed: "Талаштуу",
        statusAll: "Баардык буйрутмалар",

        // Actions
        actionClaim: "Алуу",
        actionLocked: "Кулпуланган",
        actionStart: "Баштоо",
        actionCancel: "Баш тартуу",
        actionComplete: "Аяктоо",
        actionBack: "Артка",
        actionSubmit: "Жиберүү",
        actionEdit: "Өзгөртүү",
        actionSave: "Сактоо",
        actionDelete: "Өчүрүү",
        actionAssign: "Дайындоо",
        actionReopen: "Кайра ачуу",
        actionPay: "Төлөө",
        actionCall: "Чалуу",
        actionCopy: "Көчүрүү",

        // Cards
        cardStartToSeeAddress: "Даректи көрүү үчүн баштаңыз",
        cardPendingApproval: "Тастыктоону күтүүдө",
        cardUnassigned: "Дайындала элек",
        cardStuck: "Токтоп калды",

        // Order Details
        clientName: "Кардардын аты",
        clientPhone: "Кардардын телефону",
        address: "Дарек",
        fullAddress: "Толук дарек",
        district: "Район",
        description: "Сүрөттөмө",
        problemDescription: "Көйгөйдүн сүрөттөлүшү",
        serviceType: "Кызмат түрү",
        price: "Баасы",
        initialPrice: "Баштапкы баа",
        finalPrice: "Акыркы баа",
        calloutFee: "Чыгуу акысы",
        fixedPrice: "Белгиленген баа",
        priceOpen: "Ачык",
        priceBase: "негиз",
        currencySom: "сом",

        // Financials
        prepaidBalance: "Баланс",
        balanceBlocked: "Баланс бөгөттөлдү",
        initialDeposit: "Баштапкы депозит",
        threshold: "Чеги",
        finNetBalance: "Таза баланс",
        finTotalEarned: "Бардык киреше",
        finCommissionPaid: "Төлөнгөн комиссия",
        finCommissionOwed: "Төлөнчү комиссия",
        finJobsDone: "Аткарылган иштер",
        finPaid: "Төлөндү",
        finPending: "Күтүүдө",
        debt: "Карыз",

        // Profile
        rating: "Рейтинг",
        completed: "Аяктаган",
        refused: "Баш тарткан",
        professionalInfo: "Кесиптик маалымат",
        serviceArea: "Кызмат көрсөтүү аймагы",
        license: "Лицензия",
        experience: "Тажрыйба",
        years: "жыл",
        specializations: "Адистиктер",
        jobs: "иштер",

        // Periods
        periodAll: "Бардык убакыт",
        periodMonth: "Ай",
        periodWeek: "Апта",
        periodToday: "Бүгүн",

        // Schedule
        schedule: "Убакыт",
        preferredDate: "Каалаган дата",
        preferredTime: "Каалаган убакыт",
        dateToday: "Бүгүн",
        dateTomorrow: "Эртең",
        timeMorning: "Эртең менен",
        timeAfternoon: "Түш",
        timeEvening: "Кечинде",

        // Pricing
        pricing: "Баа",
        pricingMasterQuotes: "Мастер баа",
        pricingFixed: "Белгиленген",

        // Modals
        modalCompleteTitle: "Ишти аяктоо",
        modalFinalPrice: "Акыркы баа",
        modalWorkPerformed: "Аткарылган жумуштар",
        modalHoursWorked: "Иштелген сааттар",
        modalCancelTitle: "Иштен баш тартуу",
        modalSelectReason: "Себебин тандаңыз",
        modalAdditionalNotes: "Кошумча белгилер",
        modalOrderPrefix: "Буйрутма #",
        modalPaymentTitle: "Төлөмдү ырастоо",
        modalSelectMaster: "Уста тандаңыз",
        modalAssignTitle: "Устаны дайындоо",
        modalAssignMsg: "{0} деген устаны бул буйрутмага дайындайсызбы?",

        // Payment
        paymentAmount: "Сумма",
        paymentProof: "Чектин шилтемеси",
        paymentMethod: "Төлөм ыкмасы",
        paymentCash: "Накталай",
        paymentTransfer: "Которуу",
        paymentCard: "Карта",

        // Badges
        badgeDispute: "Талаш",
        badgeUnpaid: "Төлөнбөгөн",
        badgeStuck: "Токтогон",

        // Issues
        issueAllIssues: "Бардык маселелер",
        issueStuck: "Токтогон",
        issueDisputed: "Талаштуу",
        issueUnpaid: "Төлөнбөгөн",
        issueCanceled: "Жокко чыгарылган",

        // Time Units
        timeUnitNow: "Азыр эле",
        timeUnitMins: "м мурун",
        timeUnitHours: "с мурун",
        timeUnitDays: "к мурун",

        // Toasts & Alerts
        toastCopied: "Көчүрүлдү!",
        toastUpdated: "Жаңыланды",
        toastPaymentConfirmed: "Төлөм ырасталды!",
        toastMasterAssigned: "Мастер дайындалды!",
        toastOrderCreated: "Буйрутма түзүлдү!",
        toastFillRequired: "Талап кылынган талааларды толтуруңуз",
        toastFixPhone: "Телефон форматын оңдоңуз",
        toastConfirmDetails: "Маалыматтарды ырастаңыз",
        toastSelectPaymentMethod: "Төлөм ыкмасын тандаңыз",
        toastProofRequired: "Чек талап кылынат",
        toastNoOrderSelected: "Буйрутма тандалган жок",
        toastFormCleared: "Форма тазаланды",
        toastAssignFail: "Дайындоо катасы",
        toastCreateFailed: "Түзүү катасы",
        toastFailedPrefix: "Ката: ",
        alertLogoutTitle: "Чыгуу",
        alertLogoutMsg: "Ишенимдүүсүзбү?",
        alertLogoutBtn: "Чыгуу",
        alertCancelTitle: "Буйрутманы жокко чыгаруу",
        alertCancelMsg: "Ишенимдүүсүзбү?",
        alertAssignBtn: "Дайындоо",

        // Errors
        errorPhoneFormat: "Ката формат (+996...)",
        errorGeneric: "Бир нерсе туура эмес болду",
        errorNetwork: "Тармак катасы",
        errorLoadFailed: "Маалыматты жүктөө ишке ашкан жок",

        // Create Order
        createOrder: "Буйрутма түзүү",
        createClientDetails: "Кардардын маалыматы",
        createPhone: "Телефон",
        createName: "Аты",
        createLocation: "Жайгашкан жер",
        createDistrict: "Район",
        createFullAddress: "Толук дарек",
        createServiceType: "Кызмат түрү",
        createProblemDesc: "Көйгөйдүн сүрөттөлүшү",
        createPrice: "Баасы",
        createInternalNote: "Ички белги",
        createConfirm: "Толуктоолорду ырастоо",
        createClear: "Тазалоо",
        createPublish: "Жарыялоо",
        createAnother: "Дагы түзүү",
        createSuccess: "Буйрутма түзүлдү!",
        createViewQueue: "Кезекти көрүү",
        createAnotherOrder: "Дагы буйрутма түзүү",

        // Labels
        labelCallout: "Чакыруу:",
        labelInitial: "Баштапкы:",
        labelFinal: "Акыркы:",
        labelAmount: "Сумма:",
        labelProof: "Чектин шилтемеси",
        labelRating: "Рейтинг",
        labelJobs: "иштер",
        labelMasterPrefix: "Уста: ",
        labelAllServices: "Бардык кызматтар",

        // Buttons
        btnEdit: "Өзгөртүү",
        btnCancelEdit: "Жокко чыгаруу",
        btnClose: "Жабуу",
        btnPay: "Төлөө",
        btnCopy: "Көчүрүү",
        btnCall: "Чалуу",
        btnSaveChanges: "Сактоо",
        btnPayWithAmount: "{0}с төлөө",
        btnSortNewest: "↓ Жаңылар",
        btnSortOldest: "↑ Эскилер",

        // Recent & Other
        recentBtn: "Акыркы",
        needsAttention: "Көңүл буруңуз",
        needsAttentionSort: "Реттөө",
        noMasters: "Бош уста жок",
        msgNoMatch: "Эч нерсе табылган жок",
        emptyList: "Буйрутма табылган жок",
        ordersQueue: "Буйрутмалар кезеги",
        showFilters: "Фильтрлерди көрсөтүү",
        hideFilters: "Фильтрлерди жашыруу",
        selectOption: "Тандоо",
        keepLocation: "Даректи сактоо",
        startFresh: "Жаңыдан баштоо",

        // Misc Placeholders
        districtPlaceholder: "мис. Ленин",
        addressPlaceholder: "Толук дарек",

        // Empty States
        emptyPoolTitle: "Жеткиликтүү буйрутмалар жок",
        emptyJobsTitle: "Активдүү жумуштар жок",
        noOrderHistory: "Буйрутма тарыхы бош",

        // Drawer
        drawerTitle: "Буйрутма #{0}",
    }
};

const LocalizationContext = createContext();

export const LocalizationProvider = ({ children }) => {
    const [language, setLanguage] = useState('en');

    useEffect(() => {
        loadLanguage();
    }, []);

    const loadLanguage = async () => {
        try {
            const storedLang = await AsyncStorage.getItem('user-language');
            if (storedLang) {
                setLanguage(storedLang);
            }
        } catch (e) {
            console.error('Failed to load language', e);
        }
    };

    const changeLanguage = async (lang) => {
        try {
            await AsyncStorage.setItem('user-language', lang);
            setLanguage(lang);
        } catch (e) {
            console.error('Failed to save language', e);
        }
    };

    const cycleLanguage = async () => {
        const langs = ['en', 'ru', 'kg'];
        const nextIndex = (langs.indexOf(language) + 1) % langs.length;
        await changeLanguage(langs[nextIndex]);
    };

    const t = (key) => {
        return translations[language]?.[key] || translations['en']?.[key] || key;
    };

    return (
        <LocalizationContext.Provider value={{ language, setLanguage: changeLanguage, cycleLanguage, t, translations }}>
            {children}
        </LocalizationContext.Provider>
    );
};

export const useLocalization = () => useContext(LocalizationContext);
