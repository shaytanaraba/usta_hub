import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ordersService, { ORDER_STATUS } from '../../../services/orders';
import earningsService from '../../../services/earnings';
import { normalizeKyrgyzPhone, isValidKyrgyzPhone } from '../../../utils/phone';
import { STORAGE_KEYS } from '../constants';
import { dispatcherError } from '../utils/logger';

export default function useDispatcherOrderActions({
  language,
  translations,
  showToast,
  user,
  dispatchers,
  activeTab,
  statsWindowDays,
  newOrder,
  phoneError,
  confirmChecked,
  paymentData,
  paymentOrder,
  assignTarget,
  detailsOrder,
  editForm,
  platformSettings,
  generateIdempotencyKey,
  setActionLoading,
  setPhoneError,
  setNewOrder,
  setConfirmChecked,
  setCreationSuccess,
  setQueueTotalCount,
  setPickerModal,
  setPaymentData,
  setPaymentOrder,
  setShowPaymentModal,
  setShowAssignModal,
  setAssignTarget,
  setDetailsOrder,
  setShowMasterDetails,
  setMasterDetails,
  setMasterDetailsLoading,
  setIsEditing,
  setIsSidebarOpen,
  setIdempotencyKey,
  patchOrderInState,
  removeOrderFromState,
  addOrderToState,
  scheduleBackgroundRefresh,
  loadQueueData,
  loadStatsSummary,
  saveRecentAddress,
  logout,
  navigation,
}) {
  const getAssignErrorMessage = useCallback((errorCode) => {
    if (!errorCode) return null;
    const map = {
      INVALID_STATUS: translations[language].errorAssignInvalidStatus,
      MASTER_NOT_VERIFIED: translations[language].errorAssignMasterNotVerified,
      MASTER_INACTIVE: translations[language].errorAssignMasterInactive,
      MASTER_NOT_FOUND: translations[language].errorAssignMasterNotFound,
      ORDER_NOT_FOUND: translations[language].errorAssignOrderNotFound,
      UNAUTHORIZED: translations[language].errorAssignUnauthorized,
    };
    return map[errorCode] || null;
  }, [language, translations]);

  const handleCreateOrder = useCallback(async () => {
    if (!confirmChecked) {
      showToast?.(translations[language].toastConfirmDetails, 'error');
      return;
    }
    if (!newOrder.clientName?.trim()) {
      showToast?.(translations[language].toastClientNameRequired || 'Client name is required', 'error');
      return;
    }
    if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
      showToast?.(translations[language].toastFillRequired, 'error');
      return;
    }
    if (phoneError) {
      showToast?.(translations[language].toastFixPhone, 'error');
      return;
    }

    const parsedCallout = newOrder.calloutFee !== '' && newOrder.calloutFee !== null && newOrder.calloutFee !== undefined
      ? parseFloat(newOrder.calloutFee)
      : null;
    const calloutValue = !Number.isNaN(parsedCallout) ? parsedCallout : null;
    const parsedInitial = newOrder.pricingType === 'fixed' && newOrder.initialPrice !== '' && newOrder.initialPrice !== null && newOrder.initialPrice !== undefined
      ? parseFloat(newOrder.initialPrice)
      : null;
    const initialValue = !Number.isNaN(parsedInitial) ? parsedInitial : null;

    if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
      showToast?.(translations[language].errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const result = await ordersService.createOrderExtended({
        clientName: newOrder.clientName,
        clientPhone: newOrder.clientPhone,
        pricingType: newOrder.pricingType === 'fixed' ? 'fixed' : 'unknown',
        initialPrice: newOrder.pricingType === 'fixed' ? parseFloat(newOrder.initialPrice) || null : null,
        calloutFee: parseFloat(newOrder.calloutFee) || null,
        serviceType: newOrder.serviceType,
        urgency: newOrder.urgency,
        problemDescription: newOrder.problemDescription,
        area: newOrder.area,
        fullAddress: newOrder.fullAddress,
        orientir: newOrder.orientir || null,
        preferredDate: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : null,
        preferredTime: newOrder.preferredTime || null,
        dispatcherNote: newOrder.dispatcherNote || null,
      }, user.id);

      if (result.success) {
        showToast?.(translations[language].toastOrderCreated || 'Order created!', 'success');
        await saveRecentAddress(newOrder.area, newOrder.fullAddress);
        await AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
        setCreationSuccess({ id: result.orderId });
        setConfirmChecked(false);
        if (result.order) addOrderToState(result.order);
        setQueueTotalCount((prev) => prev + 1);
        scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'create_order' }));
        if (activeTab === 'stats') {
          loadStatsSummary(statsWindowDays, 'stats_after_create');
        }
      } else {
        showToast?.(translations[language].toastOrderFailed || translations[language].toastCreateFailed, 'error');
      }
    } catch (error) {
      dispatcherError('Actions', 'handleCreateOrder failed', error);
      showToast?.(translations[language].toastCreateFailed, 'error');
    } finally {
      setActionLoading(false);
    }
  }, [
    activeTab,
    addOrderToState,
    confirmChecked,
    language,
    loadQueueData,
    loadStatsSummary,
    newOrder,
    phoneError,
    saveRecentAddress,
    scheduleBackgroundRefresh,
    setActionLoading,
    setConfirmChecked,
    setCreationSuccess,
    setQueueTotalCount,
    showToast,
    statsWindowDays,
    translations,
    user?.id,
  ]);

  const handlePhoneBlur = useCallback(() => {
    const normalized = normalizeKyrgyzPhone(newOrder.clientPhone);
    const nextValue = normalized || newOrder.clientPhone;
    setNewOrder((prev) => ({ ...prev, clientPhone: nextValue }));
    setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? translations[language].errorPhoneFormat : '');
  }, [language, newOrder.clientPhone, setNewOrder, setPhoneError, translations]);

  const handlePastePhone = useCallback(async () => {
    try {
      let text = '';
      if (Platform.OS === 'web' && navigator?.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      } else {
        text = await Clipboard.getStringAsync();
      }
      if (text) {
        const normalized = normalizeKyrgyzPhone(text);
        const nextValue = normalized || text;
        setNewOrder((prev) => ({ ...prev, clientPhone: nextValue }));
        showToast?.(translations[language].toastPasted, 'success');
        setPhoneError(nextValue && !isValidKyrgyzPhone(nextValue) ? translations[language].errorPhoneFormat : '');
      } else {
        showToast?.(translations[language].toastClipboardEmpty, 'info');
      }
    } catch (error) {
      dispatcherError('Actions', 'handlePastePhone failed', error);
      showToast?.(translations[language].toastPasteFailed, 'error');
    }
  }, [language, setNewOrder, setPhoneError, showToast, translations]);

  const handleCall = useCallback((phone) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  }, []);

  const handleConfirmPayment = useCallback(async () => {
    if (!paymentData.method) {
      showToast?.(translations[language].toastSelectPaymentMethod, 'error');
      return;
    }
    if (paymentData.method === 'transfer' && !paymentData.proofUrl) {
      showToast?.(translations[language].toastProofRequired, 'error');
      return;
    }
    if (!paymentOrder?.id) {
      showToast?.(translations[language].toastNoOrderSelected, 'error');
      return;
    }

    setActionLoading(true);
    try {
      const result = await ordersService.confirmPayment(paymentOrder.id, user.id, {
        paymentMethod: paymentData.method,
        paymentProofUrl: paymentData.proofUrl || null,
      });
      if (result.success) {
        showToast?.(translations[language].toastPaymentConfirmed, 'success');
        setShowPaymentModal(false);
        setPaymentOrder(null);
        setPaymentData({ method: 'cash', proofUrl: '' });
        patchOrderInState(paymentOrder.id, {
          status: ORDER_STATUS.CONFIRMED,
          confirmed_at: new Date().toISOString(),
          payment_method: paymentData.method,
        });
        scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'confirm_payment' }));
        if (activeTab === 'stats') {
          loadStatsSummary(statsWindowDays, 'stats_after_confirm_payment');
        }
      } else {
        showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
      }
    } catch (error) {
      dispatcherError('Actions', 'handleConfirmPayment failed', error);
      showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [
    activeTab,
    language,
    loadQueueData,
    loadStatsSummary,
    patchOrderInState,
    paymentData,
    paymentOrder,
    scheduleBackgroundRefresh,
    setActionLoading,
    setPaymentData,
    setPaymentOrder,
    setShowPaymentModal,
    showToast,
    statsWindowDays,
    translations,
    user?.id,
  ]);

  const openAssignModal = useCallback((order) => {
    if (!order) return;
    setAssignTarget(order);
    setDetailsOrder(null);
    setShowAssignModal(true);
  }, [setAssignTarget, setDetailsOrder, setShowAssignModal]);

  const handleTransferDispatcher = useCallback(async (order, targetDispatcherId) => {
    if (!order?.id || !user?.id || !targetDispatcherId) return;
    setActionLoading(true);
    try {
      const result = await ordersService.transferOrderToDispatcher(order.id, user.id, targetDispatcherId, user?.role);
      if (result.success) {
        showToast?.(translations[language].toastTransferSuccess || 'Order transferred', 'success');
        removeOrderFromState(order.id);
        setQueueTotalCount((prev) => Math.max(0, prev - 1));
        setDetailsOrder(null);
        scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'transfer_dispatcher' }));
      } else {
        showToast?.(translations[language].toastTransferFailed || 'Transfer failed', 'error');
      }
    } catch (error) {
      dispatcherError('Actions', 'handleTransferDispatcher failed', error);
      showToast?.(translations[language].toastTransferFailed || 'Transfer failed', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [
    language,
    loadQueueData,
    removeOrderFromState,
    scheduleBackgroundRefresh,
    setActionLoading,
    setDetailsOrder,
    setQueueTotalCount,
    showToast,
    translations,
    user?.id,
    user?.role,
  ]);

  const openTransferPicker = useCallback((order) => {
    if (!order) return;
    const options = (dispatchers || [])
      .filter((dispatcher) => dispatcher?.id && dispatcher.id !== user?.id)
      .map((dispatcher) => ({
        id: dispatcher.id,
        label: dispatcher.full_name || dispatcher.email || dispatcher.phone || `Dispatcher ${String(dispatcher.id).slice(0, 6)}`,
      }));
    if (options.length === 0) {
      showToast?.(translations[language].noDispatchersFound || 'No other dispatchers found', 'info');
      return;
    }
    setPickerModal({
      visible: true,
      title: translations[language].pickerDispatcher || 'Select dispatcher',
      options,
      value: '',
      onChange: async (targetId) => handleTransferDispatcher(order, targetId),
    });
  }, [dispatchers, handleTransferDispatcher, language, setPickerModal, showToast, translations, user?.id]);

  const handleAssignMaster = useCallback(async (master) => {
    const targetOrder = assignTarget || detailsOrder;
    const targetId = targetOrder?.id;
    if (!targetId) {
      showToast?.(translations[language].toastNoOrderSelected || 'No order selected', 'error');
      return;
    }
    const maxJobs = Number.isFinite(Number(master?.max_active_jobs)) ? Number(master.max_active_jobs) : null;
    const activeJobs = Number.isFinite(Number(master?.active_jobs)) ? Number(master.active_jobs) : 0;
    if (maxJobs !== null && activeJobs >= maxJobs) {
      showToast?.(translations[language].errorMasterLimitReached || 'Master has reached the active jobs limit', 'error');
      return;
    }
    const msg = (translations[language].alertAssignMsg || 'Assign {0}?').replace('{0}', master.full_name);

    const confirmAssign = async () => {
      setActionLoading(true);
      try {
        const needsReassign = !!(targetOrder?.master_id || targetOrder?.master);
        if (needsReassign) {
          const unassignRes = await ordersService.unassignMaster(targetId, user.id, 'dispatcher_reassign', user?.role);
          if (!unassignRes.success) {
            showToast?.(translations[language].toastAssignFail, 'error');
            setActionLoading(false);
            return;
          }
        }
        const result = await ordersService.forceAssignMaster(targetId, master.id, 'Dispatcher assignment');
        if (result.success) {
          showToast?.(translations[language].toastMasterAssigned, 'success');
          if (result.order) {
            patchOrderInState(targetId, result.order);
          } else {
            patchOrderInState(targetId, {
              master_id: master.id,
              master: { id: master.id, full_name: master.full_name, phone: master.phone },
            });
          }
          setShowAssignModal(false);
          setDetailsOrder(null);
          setAssignTarget(null);
          scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'assign_master' }));
        } else {
          const mapped = getAssignErrorMessage(result?.error);
          showToast?.(mapped || translations[language].toastAssignFail, 'error');
        }
      } catch (error) {
        dispatcherError('Actions', 'handleAssignMaster failed', error);
        showToast?.(translations[language].toastAssignFail, 'error');
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(msg)) confirmAssign();
    } else {
      Alert.alert(translations[language].alertAssignTitle, msg, [
        { text: translations[language].cancel, style: 'cancel' },
        { text: translations[language].alertAssignBtn, onPress: confirmAssign },
      ]);
    }
  }, [
    assignTarget,
    detailsOrder,
    getAssignErrorMessage,
    language,
    loadQueueData,
    patchOrderInState,
    scheduleBackgroundRefresh,
    setActionLoading,
    setAssignTarget,
    setDetailsOrder,
    setShowAssignModal,
    showToast,
    translations,
    user?.id,
    user?.role,
  ]);

  const openMasterDetails = useCallback(async (master) => {
    if (!master?.id) {
      showToast?.(translations[language].errorMasterDetailsUnavailable || 'Master details unavailable', 'error');
      return;
    }
    setShowMasterDetails(true);
    setMasterDetails({ profile: master, summary: null });
    setMasterDetailsLoading(true);
    const summary = await earningsService.getMasterFinancialSummary(master.id);
    setMasterDetails({ profile: master, summary });
    setMasterDetailsLoading(false);
  }, [language, setMasterDetails, setMasterDetailsLoading, setShowMasterDetails, showToast, translations]);

  const closeMasterDetails = useCallback(() => {
    setShowMasterDetails(false);
    setMasterDetails(null);
    setMasterDetailsLoading(false);
  }, [setMasterDetails, setMasterDetailsLoading, setShowMasterDetails]);

  const handleRemoveMaster = useCallback(async () => {
    if (!detailsOrder?.id || !user?.id) return;
    if ([ORDER_STATUS.COMPLETED, ORDER_STATUS.CONFIRMED].includes(detailsOrder.status)) {
      showToast?.(translations[language].errorCannotUnassign || 'Cannot remove master from completed/confirmed order', 'error');
      return;
    }
    const confirmRemove = async () => {
      setActionLoading(true);
      try {
        const result = await ordersService.unassignMaster(detailsOrder.id, user.id, 'dispatcher_unassign', user?.role);
        if (result.success) {
          showToast?.(translations[language].toastMasterUnassigned || 'Master removed', 'success');
          patchOrderInState(detailsOrder.id, { status: ORDER_STATUS.REOPENED, master_id: null, master: null });
          setIsEditing(false);
          setDetailsOrder(null);
          scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'remove_master' }));
        } else {
          showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
        }
      } catch (error) {
        dispatcherError('Actions', 'handleRemoveMaster failed', error);
        showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
      } finally {
        setActionLoading(false);
      }
    };

    const msg = translations[language].alertUnassignMsg || 'Remove master and reopen this order?';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) confirmRemove();
    } else {
      Alert.alert(translations[language].alertUnassignTitle || 'Remove Master', msg, [
        { text: translations[language].cancel, style: 'cancel' },
        { text: translations[language].alertUnassignBtn || 'Remove', style: 'destructive', onPress: confirmRemove },
      ]);
    }
  }, [
    detailsOrder,
    language,
    loadQueueData,
    patchOrderInState,
    scheduleBackgroundRefresh,
    setActionLoading,
    setDetailsOrder,
    setIsEditing,
    showToast,
    translations,
    user?.id,
    user?.role,
  ]);

  const handleSaveEdit = useCallback(async () => {
    setActionLoading(true);
    try {
      const normalizedPhone = ordersService.normalizeKyrgyzPhone(editForm.client_phone);
      if (editForm.client_phone && !normalizedPhone) {
        showToast?.(translations[language].errorPhoneFormat || 'Invalid phone format', 'error');
        setActionLoading(false);
        return;
      }
      const parsedCallout = editForm.callout_fee !== '' && editForm.callout_fee !== null && editForm.callout_fee !== undefined
        ? parseFloat(editForm.callout_fee)
        : null;
      const calloutValue = !Number.isNaN(parsedCallout) ? parsedCallout : null;
      const parsedInitial = editForm.initial_price !== '' && editForm.initial_price !== null && editForm.initial_price !== undefined
        ? parseFloat(editForm.initial_price)
        : null;
      const initialValue = !Number.isNaN(parsedInitial) ? parsedInitial : null;
      if (calloutValue !== null && initialValue !== null && initialValue < calloutValue) {
        showToast?.(translations[language].errorInitialBelowCallout || 'Initial price cannot be lower than call-out fee', 'error');
        setActionLoading(false);
        return;
      }

      const updates = {
        problem_description: editForm.problem_description,
        dispatcher_note: editForm.dispatcher_note,
        full_address: editForm.full_address,
        area: editForm.area,
        orientir: editForm.orientir || null,
        callout_fee: editForm.callout_fee,
        initial_price: editForm.initial_price,
        client_name: editForm.client_name,
        client_phone: normalizedPhone || editForm.client_phone,
      };

      const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
      if (result.success) {
        showToast?.(translations[language].toastUpdated, 'success');
        setIsEditing(false);
        if (result.order) {
          patchOrderInState(detailsOrder.id, result.order);
        } else {
          patchOrderInState(detailsOrder.id, {
            ...updates,
            client: {
              ...detailsOrder?.client,
              full_name: updates.client_name,
              phone: updates.client_phone,
            },
          });
        }
        setDetailsOrder((prev) => ({
          ...prev,
          ...editForm,
          client: {
            ...prev.client,
            full_name: editForm.client_name,
            phone: editForm.client_phone,
          },
        }));
        scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'save_edit' }));
      } else {
        showToast?.(translations[language].toastOrderFailed || translations[language].toastCreateFailed, 'error');
      }
    } catch (error) {
      dispatcherError('Actions', 'handleSaveEdit failed', error);
      showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
    } finally {
      setActionLoading(false);
    }
  }, [
    detailsOrder,
    editForm,
    language,
    loadQueueData,
    patchOrderInState,
    scheduleBackgroundRefresh,
    setActionLoading,
    setDetailsOrder,
    setIsEditing,
    showToast,
    translations,
  ]);

  const handleCancel = useCallback((orderId) => {
    const confirmCancel = async () => {
      const result = await ordersService.cancelByClient(orderId, user.id, 'client_request', user?.role);
      if (result.success) {
        showToast?.(translations[language].statusCanceled, 'success');
        patchOrderInState(orderId, { status: ORDER_STATUS.CANCELED_BY_CLIENT, canceled_at: new Date().toISOString() });
        scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'cancel_order' }));
        setDetailsOrder(null);
      } else {
        showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(translations[language].alertCancelMsg || 'Are you sure you want to cancel this order?')) {
        confirmCancel();
      }
    } else {
      Alert.alert(translations[language].alertCancelTitle, translations[language].alertCancelMsg, [
        { text: translations[language].cancel, style: 'cancel' },
        { text: translations[language].yes || 'Yes', style: 'destructive', onPress: confirmCancel },
      ]);
    }
  }, [language, loadQueueData, patchOrderInState, scheduleBackgroundRefresh, setDetailsOrder, showToast, translations, user?.id, user?.role]);

  const handleReopen = useCallback(async (orderId) => {
    const result = await ordersService.reopenOrder(orderId, user.id, user?.role);
    if (result.success) {
      showToast?.(translations[language].filterStatusReopened, 'success');
      patchOrderInState(orderId, {
        status: ORDER_STATUS.REOPENED,
        master_id: null,
        master: null,
        claimed_at: null,
        started_at: null,
      });
      scheduleBackgroundRefresh((ctx) => loadQueueData({ reason: ctx?.reason || 'reopen_order' }));
    } else {
      showToast?.(translations[language].toastFailedPrefix + (translations[language].errorGeneric || 'Error'), 'error');
    }
  }, [language, loadQueueData, patchOrderInState, scheduleBackgroundRefresh, showToast, translations, user?.id, user?.role]);

  const copyToClipboard = useCallback(async (text) => {
    if (!text) return;
    try {
      if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text));
      } else {
        await Clipboard.setStringAsync(String(text));
      }
      showToast?.(translations[language].toastCopied, 'success');
    } catch (error) {
      dispatcherError('Actions', 'copyToClipboard failed', error);
      showToast?.(translations[language].toastCopyFailed || 'Copy failed', 'error');
    }
  }, [language, showToast, translations]);

  const handleLogout = useCallback(async () => {
    const doLogout = async () => {
      try {
        await logout({ scope: 'local' });
      } catch (error) {
        dispatcherError('Actions', 'logout failed', error);
      } finally {
        setIsSidebarOpen(false);
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${translations[language].alertLogoutTitle}?`)) await doLogout();
    } else {
      Alert.alert(translations[language].alertLogoutTitle, translations[language].alertLogoutMsg, [
        { text: translations[language].cancel, style: 'cancel' },
        { text: translations[language].alertLogoutBtn, onPress: doLogout },
      ]);
    }
  }, [language, logout, navigation, setIsSidebarOpen, translations]);

  const clearForm = useCallback(() => {
    setNewOrder((prev) => ({
      ...prev,
      clientName: '',
      clientPhone: '',
      pricingType: 'unknown',
      initialPrice: '',
      calloutFee: platformSettings?.base_price ? String(platformSettings.base_price) : '',
      serviceType: 'repair',
      urgency: 'planned',
      problemDescription: '',
      area: '',
      fullAddress: '',
      orientir: '',
      preferredDate: '',
      preferredTime: '',
      dispatcherNote: '',
    }));
    setConfirmChecked(false);
    setPhoneError('');
    setIdempotencyKey(generateIdempotencyKey());
    AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
    showToast?.(translations[language].toastFormCleared, 'success');
  }, [generateIdempotencyKey, language, platformSettings?.base_price, setConfirmChecked, setIdempotencyKey, setNewOrder, setPhoneError, showToast, translations]);

  const keepLocationAndReset = useCallback(() => {
    setNewOrder((prev) => ({
      clientName: '',
      clientPhone: '',
      pricingType: 'unknown',
      initialPrice: '',
      calloutFee: platformSettings?.base_price ? String(platformSettings.base_price) : '',
      serviceType: 'repair',
      urgency: 'planned',
      problemDescription: '',
      area: prev.area,
      fullAddress: prev.fullAddress,
      orientir: '',
      preferredDate: '',
      preferredTime: '',
      dispatcherNote: '',
    }));
    setIdempotencyKey(generateIdempotencyKey());
    setConfirmChecked(false);
    setCreationSuccess(null);
  }, [generateIdempotencyKey, platformSettings?.base_price, setConfirmChecked, setCreationSuccess, setIdempotencyKey, setNewOrder]);

  return {
    handleCreateOrder,
    handlePhoneBlur,
    handlePastePhone,
    handleCall,
    handleConfirmPayment,
    openAssignModal,
    openTransferPicker,
    handleTransferDispatcher,
    handleAssignMaster,
    openMasterDetails,
    closeMasterDetails,
    handleRemoveMaster,
    handleSaveEdit,
    handleCancel,
    handleReopen,
    copyToClipboard,
    handleLogout,
    clearForm,
    keepLocationAndReset,
  };
}
