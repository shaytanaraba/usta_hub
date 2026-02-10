import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function DispatcherCreateOrderTab({
  styles,
  isDark,
  translations,
  language,
  actionLoading,
  creationSuccess,
  setActiveTab,
  setCreationSuccess,
  clearForm,
  keepLocationAndReset,
  phoneError,
  newOrder,
  setNewOrder,
  handlePhoneBlur,
  handlePastePhone,
  openDistrictPicker,
  districts,
  serviceTypes,
  showDatePicker,
  showTimePicker,
  setShowDatePicker,
  setShowTimePicker,
  parseDateStr,
  parseTimeStr,
  onDateChange,
  onTimeChange,
  platformSettings,
  sanitizeNumberInput,
  confirmChecked,
  setConfirmChecked,
  handleCreateOrder,
  loading,
  skeletonPulse,
}) {
  const TRANSLATIONS = translations;
  const publishDisabled = !confirmChecked || actionLoading;

  const renderLoading = () => (
    <View style={styles.createWrapper}>
      <ScrollView
        style={styles.createContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.createScrollContent}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <Animated.View
            key={`create-skeleton-${index}`}
            style={[
              styles.skeletonCard,
              !isDark && styles.skeletonCardLight,
              { opacity: skeletonPulse },
            ]}
          >
            <View style={styles.skeletonHeaderRow}>
              <View style={styles.skeletonLineWide} />
              <View style={styles.skeletonLineShort} />
            </View>
            <View style={styles.skeletonLineMid} />
            <View style={styles.skeletonLineFull} />
            <View style={styles.skeletonAction} />
          </Animated.View>
        ))}
      </ScrollView>
      <View style={[styles.fixedBottomBar, !isDark && styles.fixedBottomBarLight]}>
        <Animated.View
          style={[
            styles.skeletonAction,
            { opacity: skeletonPulse, marginTop: 0 },
          ]}
        />
      </View>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.successContainer}>
      <Text style={styles.successIcon}>{'\u2713'}</Text>
      <Text style={styles.successTitle}>{TRANSLATIONS[language].createSuccess}</Text>
      <Text style={styles.successId}>#{creationSuccess.id}</Text>
      <TouchableOpacity
        style={styles.successBtn}
        onPress={() => {
          setActiveTab('queue');
          setCreationSuccess(null);
          clearForm();
        }}
      >
        <Text style={styles.successBtnText}>{TRANSLATIONS[language].createViewQueue}</Text>
      </TouchableOpacity>
      <View style={styles.successDivider}>
        <Text style={styles.successDividerText}>{TRANSLATIONS[language].createAnotherOrder}</Text>
      </View>
      <View style={styles.successButtonRow}>
        <TouchableOpacity style={styles.successKeepLocationBtn} onPress={keepLocationAndReset}>
          <Text style={styles.successKeepLocationText}>{TRANSLATIONS[language].keepLocation} {'\u2192'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.successBtnAlt}
          onPress={() => {
            setCreationSuccess(null);
            clearForm();
          }}
        >
          <Text style={styles.successBtnAltText}>{TRANSLATIONS[language].startFresh}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderForm = () => (
    <View style={styles.createSections}>
      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createClientDetails}</Text>
        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createPhone} *</Text>
        <View style={styles.inputWithIcon}>
          <TextInput
            style={[styles.input, styles.inputWithPaste, phoneError && styles.inputError, !isDark && styles.inputLight]}
            placeholder="+996..."
            value={newOrder.clientPhone}
            onChangeText={(value) => setNewOrder({ ...newOrder, clientPhone: value })}
            onBlur={handlePhoneBlur}
            keyboardType="phone-pad"
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          />
          <TouchableOpacity style={styles.inFieldBtn} onPress={handlePastePhone}>
            <Text style={styles.inFieldBtnText}>{'\u2398'}</Text>
          </TouchableOpacity>
        </View>
        {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createName}</Text>
        <TextInput
          style={[styles.input, !isDark && styles.inputLight]}
          placeholder={TRANSLATIONS[language].createName}
          value={newOrder.clientName}
          onChangeText={(value) => setNewOrder({ ...newOrder, clientName: value })}
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />
      </View>

      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createLocation}</Text>
        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createDistrict} *</Text>
        <TouchableOpacity
          style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, !isDark && styles.inputLight]}
          onPress={openDistrictPicker}
        >
          <Text style={[styles.pickerBtnText, !newOrder.area && styles.placeholderText, !isDark && styles.textDark]}>
            {newOrder.area ? (districts.find((d) => d.id === newOrder.area)?.label || newOrder.area) : (TRANSLATIONS[language].selectOption || 'Select')}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>{'\u25BE'}</Text>
        </TouchableOpacity>

        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createFullAddress} *</Text>
        <TextInput
          style={[styles.input, !isDark && styles.inputLight]}
          placeholder={TRANSLATIONS[language].createFullAddress}
          value={newOrder.fullAddress}
          onChangeText={(value) => setNewOrder({ ...newOrder, fullAddress: value })}
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />

        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createOrientir || 'Landmark/Orientir'}</Text>
        <TextInput
          style={[styles.input, !isDark && styles.inputLight]}
          placeholder={TRANSLATIONS[language].orientirPlaceholder || 'e.g. Near Beta Stores'}
          value={newOrder.orientir}
          onChangeText={(value) => setNewOrder({ ...newOrder, orientir: value })}
          placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
        />
      </View>

      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createServiceType}</Text>
        <View style={styles.serviceGrid}>
          {serviceTypes.map((service) => (
            <TouchableOpacity
              key={service.id}
              style={[
                styles.serviceBtn,
                newOrder.serviceType === service.id && styles.serviceBtnActive,
                !isDark && newOrder.serviceType !== service.id && styles.btnLight,
              ]}
              onPress={() => setNewOrder({ ...newOrder, serviceType: service.id })}
            >
              <Text
                style={[
                  styles.serviceBtnText,
                  !isDark && newOrder.serviceType !== service.id && styles.textDark,
                  newOrder.serviceType === service.id && styles.serviceBtnTextActive,
                ]}
              >
                {service.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].problemDesc} *</Text>
        <View style={{ position: 'relative' }}>
          <TextInput
            style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
            placeholder="..."
            value={newOrder.problemDescription}
            onChangeText={(value) => setNewOrder({ ...newOrder, problemDescription: value.substring(0, 500) })}
            multiline
            numberOfLines={3}
            maxLength={500}
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          />
          <Text style={styles.charCounter}>{(newOrder.problemDescription || '').length}/500</Text>
        </View>
      </View>

      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].schedule}</Text>
        <View style={styles.urgencyRow}>
          <TouchableOpacity
            style={[styles.urgencyBtn, newOrder.urgency === 'planned' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'planned' && styles.btnLight]}
            onPress={() => setNewOrder({ ...newOrder, urgency: 'planned' })}
          >
            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'planned' && styles.textDark, newOrder.urgency === 'planned' && styles.urgencyTextActive]}>
              {TRANSLATIONS[language].urgencyPlanned}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.urgencyBtn, newOrder.urgency === 'urgent' && styles.urgencyBtnActive, !isDark && newOrder.urgency !== 'urgent' && styles.btnLight]}
            onPress={() => setNewOrder({ ...newOrder, urgency: 'urgent' })}
          >
            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'urgent' && styles.textDark, newOrder.urgency === 'urgent' && styles.urgencyTextActive]}>
              {TRANSLATIONS[language].urgencyUrgent}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.urgencyBtn, newOrder.urgency === 'emergency' && styles.urgencyBtnActive, { borderColor: '#ef4444' }, !isDark && newOrder.urgency !== 'emergency' && styles.btnLight]}
            onPress={() => setNewOrder({ ...newOrder, urgency: 'emergency' })}
          >
            <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== 'emergency' && styles.textDark, newOrder.urgency === 'emergency' && styles.urgencyTextActive]}>
              {TRANSLATIONS[language].urgencyEmergency}
            </Text>
          </TouchableOpacity>
        </View>

        {newOrder.urgency === 'planned' ? (
          <View style={styles.plannedPickerContainer}>
            <View style={styles.plannedTimeRow}>
              <View style={styles.plannedDateInput}>
                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].preferredDate || 'Date'}</Text>
                {Platform.OS === 'web' ? (
                  <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                    {React.createElement('input', {
                      type: 'date',
                      value: newOrder.preferredDate ? newOrder.preferredDate.split('.').reverse().join('-') : '',
                      onChange: (event) => {
                        const value = event.target.value;
                        if (value) {
                          const [year, month, day] = value.split('-');
                          setNewOrder({ ...newOrder, preferredDate: `${day}.${month}.${year}` });
                        } else {
                          setNewOrder({ ...newOrder, preferredDate: '' });
                        }
                      },
                      style: {
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: isDark ? '#fff' : '#0f172a',
                        width: '100%',
                        height: '100%',
                        fontFamily: 'system-ui',
                        fontSize: 14,
                      },
                    })}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.input, styles.pickerBtnDisplay, !isDark && styles.inputLight]}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={[styles.pickerBtnText, !newOrder.preferredDate && styles.placeholderText, !isDark && styles.textDark]}>
                      {newOrder.preferredDate || 'DD.MM.YYYY'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.plannedTimeInput}>
                <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].preferredTime || 'Time'}</Text>
                {Platform.OS === 'web' ? (
                  <View style={[styles.input, styles.webPickerInput, !isDark && styles.inputLight]}>
                    {React.createElement('input', {
                      type: 'time',
                      value: newOrder.preferredTime || '',
                      onChange: (event) => setNewOrder({ ...newOrder, preferredTime: event.target.value }),
                      style: {
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        color: isDark ? '#fff' : '#0f172a',
                        width: '100%',
                        height: '100%',
                        fontFamily: 'system-ui',
                        fontSize: 14,
                      },
                    })}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.input, styles.pickerBtnDisplay, !isDark && styles.inputLight]}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text style={[styles.pickerBtnText, !newOrder.preferredTime && styles.placeholderText, !isDark && styles.textDark]}>
                      {newOrder.preferredTime || 'HH:MM'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {Platform.OS !== 'web' && showDatePicker ? (
              <DateTimePicker
                value={parseDateStr(newOrder.preferredDate)}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            ) : null}
            {Platform.OS !== 'web' && showTimePicker ? (
              <DateTimePicker
                value={parseTimeStr(newOrder.preferredTime)}
                mode="time"
                display="default"
                onChange={onTimeChange}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].pricing}</Text>
        <View style={styles.pricingTypeRow}>
          <TouchableOpacity
            style={[styles.pricingTypeBtn, newOrder.pricingType === 'unknown' && styles.pricingTypeBtnActive]}
            onPress={() => setNewOrder({ ...newOrder, pricingType: 'unknown' })}
          >
            <Text style={[styles.pricingTypeBtnText, newOrder.pricingType === 'unknown' && styles.pricingTypeBtnTextActive]}>
              {TRANSLATIONS[language].pricingMasterQuotes}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pricingTypeBtn, newOrder.pricingType === 'fixed' && styles.pricingTypeBtnActiveGreen]}
            onPress={() => setNewOrder({ ...newOrder, pricingType: 'fixed' })}
          >
            <Text style={[styles.pricingTypeBtnText, newOrder.pricingType === 'fixed' && styles.pricingTypeBtnTextActive]}>
              {TRANSLATIONS[language].pricingFixed}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pricingInputRow}>
          <View style={styles.priceInputItem}>
            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].calloutFee}</Text>
            <TextInput
              style={[styles.input, !isDark && styles.inputLight]}
              placeholder={platformSettings ? String(platformSettings.base_price) : '...'}
              keyboardType="numeric"
              value={newOrder.calloutFee}
              onChangeText={(value) => setNewOrder({ ...newOrder, calloutFee: sanitizeNumberInput(value) })}
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            />
          </View>
          {newOrder.pricingType === 'fixed' ? (
            <View style={styles.priceInputItem}>
              <Text style={[styles.inputLabel, { color: '#22c55e' }]}>{TRANSLATIONS[language].fixedAmount}</Text>
              <TextInput
                style={[styles.input, !isDark && styles.inputLight]}
                placeholder="0"
                keyboardType="numeric"
                value={newOrder.initialPrice}
                onChangeText={(value) => setNewOrder({ ...newOrder, initialPrice: sanitizeNumberInput(value) })}
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              />
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
        <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].sectionNote}</Text>
        <View style={{ position: 'relative' }}>
          <TextInput
            style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
            placeholder={TRANSLATIONS[language].createInternalNote}
            value={newOrder.dispatcherNote}
            onChangeText={(value) => setNewOrder({ ...newOrder, dispatcherNote: value.substring(0, 500) })}
            multiline
            numberOfLines={2}
            maxLength={500}
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          />
          <Text style={styles.charCounter}>{(newOrder.dispatcherNote || '').length}/500</Text>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </View>
  );

  if (loading && !creationSuccess) return renderLoading();

  return (
    <View style={styles.createWrapper}>
      <ScrollView
        style={styles.createContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.createScrollContent}
      >
        {creationSuccess ? renderSuccess() : renderForm()}
      </ScrollView>

      {!creationSuccess ? (
        <View style={[styles.fixedBottomBar, !isDark && styles.fixedBottomBarLight]}>
          <TouchableOpacity style={styles.confirmRow} onPress={() => setConfirmChecked(!confirmChecked)}>
            <View style={[styles.checkbox, confirmChecked && styles.checkboxChecked]}>
              {confirmChecked ? <Text style={styles.checkmark}>{'\u2713'}</Text> : null}
            </View>
            <Text style={[styles.confirmLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].createConfirm}</Text>
          </TouchableOpacity>
          <View style={styles.bottomBarButtons}>
            <TouchableOpacity style={[styles.bottomClearBtn, !isDark && styles.btnLight]} onPress={clearForm}>
              <Text style={[styles.bottomClearBtnText, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createClear}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bottomPublishBtn,
                publishDisabled && styles.bottomPublishBtnDisabled,
                publishDisabled && styles.pointerEventsNone,
              ]}
              onPress={publishDisabled ? undefined : handleCreateOrder}
            >
              {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomPublishBtnText}>{TRANSLATIONS[language].createPublish}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
