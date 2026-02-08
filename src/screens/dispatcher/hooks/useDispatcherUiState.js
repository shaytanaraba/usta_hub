import { useCallback, useMemo, useReducer } from 'react';

const SET_STATE = 'SET_STATE';

const resolveValue = (current, next) => (typeof next === 'function' ? next(current) : next);

function reducer(state, action) {
  switch (action.type) {
    case SET_STATE:
      return {
        ...state,
        [action.key]: resolveValue(state[action.key], action.value),
      };
    default:
      return state;
  }
}

export default function useDispatcherUiState({ initialOrderState, generateIdempotencyKey }) {
  const initialState = useMemo(() => ({
    pickerModal: { visible: false, options: [], value: '', onChange: null, title: '' },
    showDatePicker: false,
    showTimePicker: false,
    detailsOrder: null,
    isEditing: false,
    editForm: {},
    showPaymentModal: false,
    paymentData: { method: 'cash', proofUrl: '' },
    paymentOrder: null,
    showAssignModal: false,
    assignTarget: null,
    showMasterDetails: false,
    masterDetails: null,
    masterDetailsLoading: false,
    newOrder: initialOrderState,
    phoneError: '',
    confirmChecked: false,
    creationSuccess: null,
    showRecentAddr: false,
    idempotencyKey: generateIdempotencyKey(),
  }), [generateIdempotencyKey, initialOrderState]);

  const [state, dispatch] = useReducer(reducer, initialState);

  const set = useCallback((key, value) => {
    dispatch({ type: SET_STATE, key, value });
  }, []);

  return {
    ...state,
    setPickerModal: (value) => set('pickerModal', value),
    setShowDatePicker: (value) => set('showDatePicker', value),
    setShowTimePicker: (value) => set('showTimePicker', value),
    setDetailsOrder: (value) => set('detailsOrder', value),
    setIsEditing: (value) => set('isEditing', value),
    setEditForm: (value) => set('editForm', value),
    setShowPaymentModal: (value) => set('showPaymentModal', value),
    setPaymentData: (value) => set('paymentData', value),
    setPaymentOrder: (value) => set('paymentOrder', value),
    setShowAssignModal: (value) => set('showAssignModal', value),
    setAssignTarget: (value) => set('assignTarget', value),
    setShowMasterDetails: (value) => set('showMasterDetails', value),
    setMasterDetails: (value) => set('masterDetails', value),
    setMasterDetailsLoading: (value) => set('masterDetailsLoading', value),
    setNewOrder: (value) => set('newOrder', value),
    setPhoneError: (value) => set('phoneError', value),
    setConfirmChecked: (value) => set('confirmChecked', value),
    setCreationSuccess: (value) => set('creationSuccess', value),
    setShowRecentAddr: (value) => set('showRecentAddr', value),
    setIdempotencyKey: (value) => set('idempotencyKey', value),
  };
}
