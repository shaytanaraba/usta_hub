import React from 'react';
import { ActivityIndicator, Dimensions, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AdminSettingsTab(props) {
    const {
        styles,
        isDark,
        TRANSLATIONS,
        districtSearch,
        setDistrictSearch,
        managedDistricts,
        cancellationSearch,
        setCancellationSearch,
        cancellationReasons,
        getLocalizedName,
        renderHeader,
        isEditing,
        setIsEditing,
        setConfigurationCollapsed,
        setTempSettings,
        tempSettings,
        settings,
        setActionLoading,
        actionLoading,
        showToast,
        loadSettings,
        onSettingsUpdated,
        ordersService,
        configurationCollapsed,
        setDistrictModal,
        setDistrictsCollapsed,
        districtsCollapsed,
        handleDeleteDistrict,
        setCancellationReasonModal,
        setCancellationReasonsCollapsed,
        cancellationReasonsCollapsed,
        handleDeleteCancellationReason,
        setServiceTypeModal,
        setServiceTypesCollapsed,
        serviceTypesCollapsed,
        serviceTypes,
        handleDeleteServiceType,
        renderServiceTypeSidebar,
        renderDistrictSidebar,
        renderCancellationReasonSidebar,
    } = props;
    const q = districtSearch.trim().toLowerCase();
    const filteredDistricts = !q
        ? managedDistricts
        : managedDistricts.filter(d =>
            [d.code, d.name_en, d.name_ru, d.name_kg, d.region, getLocalizedName(d)]
                .filter(Boolean)
                .some(val => String(val).toLowerCase().includes(q))
        );
    const cq = cancellationSearch.trim().toLowerCase();
    const filteredCancellationReasons = !cq
        ? cancellationReasons
        : cancellationReasons.filter(r =>
            [r.code, r.name_en, r.name_ru, r.name_kg, r.applicable_to, getLocalizedName(r)]
                .filter(Boolean)
                .some(val => String(val).toLowerCase().includes(cq))
        );
    const isNarrow = SCREEN_WIDTH < 640;
    const toggleSection = (sectionKey) => {
        const currentlyOpen = (
            (sectionKey === 'configuration' && !configurationCollapsed)
            || (sectionKey === 'districts' && !districtsCollapsed)
            || (sectionKey === 'cancellationReasons' && !cancellationReasonsCollapsed)
            || (sectionKey === 'serviceTypes' && !serviceTypesCollapsed)
        );
        const nextOpen = currentlyOpen ? null : sectionKey;
        setConfigurationCollapsed(nextOpen !== 'configuration');
        setDistrictsCollapsed(nextOpen !== 'districts');
        setCancellationReasonsCollapsed(nextOpen !== 'cancellationReasons');
        setServiceTypesCollapsed(nextOpen !== 'serviceTypes');
    };

    return (
        <View style={{ flex: 1 }}>
            {renderHeader(TRANSLATIONS.settingsTitle || 'Platform Settings')}
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* ============================================ */}
                    {/* CONFIGURATION SECTION */}
                    {/* ============================================ */}
                    <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                        {/* Section Header */}
                        <View style={styles.settingsSectionHeader}>
                            <View style={styles.settingsSectionTitleRow}>
                                <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                                    <Ionicons name="settings" size={20} color="#3b82f6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.configurationTitle || 'Configuration'}
                                    </Text>
                                    <Text style={styles.settingsSectionSubtitle}>
                                        {TRANSLATIONS.configurationSubtitle || 'Platform-wide settings and parameters'}
                                    </Text>
                                </View>
                            </View>

                            {/* Edit/Save Buttons - Now on the left within section flow */}
                            <View style={[styles.settingsActionRow, isNarrow && styles.settingsActionRowStacked]}>
                                {isEditing ? (
                                    <View style={styles.settingsActionGroup}>
                                        <TouchableOpacity
                                            onPress={() => setIsEditing(false)}
                                            style={[styles.settingsBtn, styles.settingsBtnSecondary, !isDark && styles.settingsBtnSecondaryLight]}
                                        >
                                            <Ionicons name="close" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                                            <Text style={[styles.settingsBtnText, !isDark && { color: '#64748b' }]}>{TRANSLATIONS.cancel || 'Cancel'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={async () => {
                                                setActionLoading(true);
                                                try {
                                                    await ordersService.updatePlatformSettings({
                                                        default_guaranteed_payout: parseFloat(tempSettings.default_guaranteed_payout) || 0,
                                                        commission_rate: (parseFloat(tempSettings.commission_rate) || 0) / 100,
                                                        price_deviation_threshold: (parseFloat(tempSettings.price_deviation_threshold) || 0) / 100,
                                                        claim_timeout_minutes: parseInt(tempSettings.claim_timeout_minutes) || 30,
                                                        order_expiry_hours: parseInt(tempSettings.order_expiry_hours) || 48
                                                    });
                                                    showToast(TRANSLATIONS.settingsSaved || 'Settings saved', 'success');
                                                    loadSettings();
                                                    onSettingsUpdated?.();
                                                    setIsEditing(false);
                                                } catch (error) {
                                                    showToast(TRANSLATIONS.errorSavingSettings || 'Error saving settings', 'error');
                                                } finally {
                                                    setActionLoading(false);
                                                }
                                            }}
                                            style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <>
                                                    <Ionicons name="checkmark" size={16} color="#fff" />
                                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.saveChanges || 'Save Changes'}</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={() => {
                                            setTempSettings({
                                                ...settings,
                                                default_guaranteed_payout: String(settings.default_guaranteed_payout || ''),
                                                commission_rate: settings.commission_rate ? (settings.commission_rate * 100).toFixed(0) : '',
                                                price_deviation_threshold: settings.price_deviation_threshold ? (settings.price_deviation_threshold * 100).toFixed(0) : '',
                                                claim_timeout_minutes: String(settings.claim_timeout_minutes || ''),
                                                order_expiry_hours: String(settings.order_expiry_hours || '')
                                            });
                                            setIsEditing(true);
                                        }}
                                        style={[styles.settingsBtn, styles.settingsBtnOutline, !isDark && styles.settingsBtnOutlineLight]}
                                    >
                                        <Ionicons name="pencil" size={16} color="#3b82f6" />
                                        <Text style={[styles.settingsBtnText, { color: '#3b82f6' }]}>{TRANSLATIONS.editSettings || 'Edit Settings'}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    onPress={() => toggleSection('configuration')}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={configurationCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!configurationCollapsed && (
                            <View style={[styles.settingsCard, !isDark && styles.settingsCardLight]}>
                                <View style={styles.settingsGrid}>
                                {/* Row 1 */}
                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.basePayout || 'Default Call-out Fee'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.standardCallout || 'Standard Call-out Fee'}</Text>
                                    {isEditing ? (
                                        <View style={styles.settingsInputWrapper}>
                                            <TextInput
                                                style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                                keyboardType="numeric"
                                                value={tempSettings.default_guaranteed_payout}
                                                onChangeText={v => setTempSettings({ ...tempSettings, default_guaranteed_payout: v })}
                                                placeholder="0"
                                                placeholderTextColor="#64748b"
                                            />
                                            <Text style={styles.settingsInputSuffix}>{TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}</Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                            {settings.default_guaranteed_payout || 0} <Text style={styles.settingsFieldUnit}>{TRANSLATIONS.currencySom || TRANSLATIONS.currency || 'som'}</Text>
                                        </Text>
                                    )}
                                </View>

                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.commissionRate || 'Commission Rate'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.platformCommission || 'Platform commission percentage'}</Text>
                                    {isEditing ? (
                                        <View style={styles.settingsInputWrapper}>
                                            <TextInput
                                                style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                                keyboardType="numeric"
                                                value={tempSettings.commission_rate}
                                                onChangeText={v => setTempSettings({ ...tempSettings, commission_rate: v })}
                                                placeholder="0"
                                                placeholderTextColor="#64748b"
                                            />
                                            <Text style={styles.settingsInputSuffix}>%</Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                            {(settings.commission_rate * 100).toFixed(0)}<Text style={styles.settingsFieldUnit}>%</Text>
                                        </Text>
                                    )}
                                </View>

                                {/* Row 2 */}
                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.priceDeviation || 'Price Deviation'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.thresholdAlerts || 'Threshold for price alerts'}</Text>
                                    {isEditing ? (
                                        <View style={styles.settingsInputWrapper}>
                                            <TextInput
                                                style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                                keyboardType="numeric"
                                                value={tempSettings.price_deviation_threshold}
                                                onChangeText={v => setTempSettings({ ...tempSettings, price_deviation_threshold: v })}
                                                placeholder="0"
                                                placeholderTextColor="#64748b"
                                            />
                                            <Text style={styles.settingsInputSuffix}>%</Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                            {(settings.price_deviation_threshold * 100).toFixed(0)}<Text style={styles.settingsFieldUnit}>%</Text>
                                        </Text>
                                    )}
                                </View>

                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.autoClaimTimeout || 'Auto-Claim Timeout'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.minutesExpire || 'Minutes before order expires'}</Text>
                                    {isEditing ? (
                                        <View style={styles.settingsInputWrapper}>
                                            <TextInput
                                                style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                                keyboardType="numeric"
                                                value={tempSettings.claim_timeout_minutes}
                                                onChangeText={v => setTempSettings({ ...tempSettings, claim_timeout_minutes: v })}
                                                placeholder="30"
                                                placeholderTextColor="#64748b"
                                            />
                                            <Text style={styles.settingsInputSuffix}>{TRANSLATIONS.unitMin || 'min'}</Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                            {settings.claim_timeout_minutes || 30} <Text style={styles.settingsFieldUnit}>{TRANSLATIONS.unitMin || 'min'}</Text>
                                        </Text>
                                    )}
                                </View>

                                {/* Row 3 */}
                                <View style={styles.settingsGridItem}>
                                    <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>{TRANSLATIONS.orderExpiry || 'Order Expiry'}</Text>
                                    <Text style={styles.settingsFieldHint}>{TRANSLATIONS.hoursExpire || 'Hours until unclaimed orders expire'}</Text>
                                    {isEditing ? (
                                        <View style={styles.settingsInputWrapper}>
                                            <TextInput
                                                style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                                keyboardType="numeric"
                                                value={tempSettings.order_expiry_hours}
                                                onChangeText={v => setTempSettings({ ...tempSettings, order_expiry_hours: v })}
                                                placeholder="48"
                                                placeholderTextColor="#64748b"
                                            />
                                            <Text style={styles.settingsInputSuffix}>{TRANSLATIONS.unitHours || 'hours'}</Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                            {settings.order_expiry_hours || 48} <Text style={styles.settingsFieldUnit}>{TRANSLATIONS.unitHours || 'hours'}</Text>
                                        </Text>
                                    )}
                                </View>

                                <View style={[styles.settingsGridItem, { opacity: 0 }]} />
                            </View>
                        </View>
                        )}
                    </View>

                    {/* Section Divider */}
                    <View style={[styles.settingsDivider, !isDark && styles.settingsDividerLight]} />

                    {/* ============================================ */}
                    {/* DISTRICTS SECTION */}
                    {/* ============================================ */}
                    <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                        <View style={styles.settingsSectionHeader}>
                            <View style={styles.settingsSectionTitleRow}>
                                <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                                    <Ionicons name="map" size={20} color="#0ea5e9" />
                                </View>
                                <View>
                                    <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.districtsTitle || 'Districts'}
                                    </Text>
                                    <Text style={styles.settingsSectionSubtitle}>
                                        {TRANSLATIONS.districtsSubtitle || 'Manage available districts'}
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.settingsActionRow, isNarrow && styles.settingsActionRowStacked]}>
                                <TouchableOpacity
                                    onPress={() => setDistrictModal({ visible: true, district: null })}
                                    style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                >
                                    <Ionicons name="add" size={18} color="#fff" />
                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.addDistrict || 'Add District'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => toggleSection('districts')}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={districtsCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!districtsCollapsed && (
                            <>
                                <View style={styles.settingsSearchRow}>
                                    <View style={[styles.searchInputWrapper, !isDark && styles.searchInputWrapperLight]}>
                                        <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                                        <TextInput
                                            style={[styles.searchInput, !isDark && styles.searchInputTextLight]}
                                            placeholder={TRANSLATIONS.searchDistricts || 'Search districts...'}
                                            placeholderTextColor="#64748b"
                                            value={districtSearch}
                                            onChangeText={setDistrictSearch}
                                        />
                                        {districtSearch ? (
                                            <TouchableOpacity onPress={() => setDistrictSearch('')} style={styles.searchClear}>
                                                <Ionicons name="close-circle" size={16} color="#64748b" />
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>

                                <ScrollView style={styles.compactList} showsVerticalScrollIndicator={false}>
                                    {filteredDistricts.map((district) => (
                                        <View key={district.id} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                            <View style={styles.serviceTypeRowInfo}>
                                                <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                                    {getLocalizedName(district, district.code)}
                                                </Text>
                                                <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                                    {TRANSLATIONS.code || 'Code:'} {district.code} | {TRANSLATIONS.region || 'Region'}: {district.region || '-'} | {district.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                                </Text>
                                            </View>
                                            <View style={styles.serviceTypeRowActions}>
                                                <TouchableOpacity
                                                    onPress={() => setDistrictModal({ visible: true, district })}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeEditBtn, !isDark && styles.serviceTypeActionBtnLight]}
                                                >
                                                    <Ionicons name="pencil" size={16} color="#3b82f6" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeleteDistrict(district.id)}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeDeleteBtn]}
                                                >
                                                    <Ionicons name="trash" size={16} color="#ef4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))}

                                    {filteredDistricts.length === 0 && (
                                        <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                            <Ionicons name="map-outline" size={48} color="#64748b" />
                                            <Text style={styles.settingsEmptyText}>{TRANSLATIONS.noDistricts || 'No districts configured'}</Text>
                                            <Text style={styles.settingsEmptyHint}>{TRANSLATIONS.addFirstDistrict || 'Add your first district to get started'}</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </View>

                    {/* Section Divider */}
                    <View style={[styles.settingsDivider, !isDark && styles.settingsDividerLight]} />

                    {/* ============================================ */}
                    {/* CANCELLATION REASONS SECTION */}
                    {/* ============================================ */}
                    <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                        <View style={styles.settingsSectionHeader}>
                            <View style={styles.settingsSectionTitleRow}>
                                <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(244, 114, 182, 0.15)' }]}>
                                    <Ionicons name="alert-circle" size={20} color="#f472b6" />
                                </View>
                                <View>
                                    <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.cancellationReasonsTitle || 'Cancellation Reasons'}
                                    </Text>
                                    <Text style={styles.settingsSectionSubtitle}>
                                        {TRANSLATIONS.cancellationReasonsSubtitle || 'Manage cancellation reasons'}
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.settingsActionRow, isNarrow && styles.settingsActionRowStacked]}>
                                <TouchableOpacity
                                    onPress={() => setCancellationReasonModal({ visible: true, reason: null })}
                                    style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                >
                                    <Ionicons name="add" size={18} color="#fff" />
                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.addCancellationReason || 'Add Reason'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => toggleSection('cancellationReasons')}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={cancellationReasonsCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!cancellationReasonsCollapsed && (
                            <>
                                <View style={styles.settingsSearchRow}>
                                    <View style={[styles.searchInputWrapper, !isDark && styles.searchInputWrapperLight]}>
                                        <Ionicons name="search" size={16} color="#64748b" style={styles.searchIconText} />
                                        <TextInput
                                            style={[styles.searchInput, !isDark && styles.searchInputTextLight]}
                                            placeholder={TRANSLATIONS.searchCancellationReasons || 'Search reasons...'}
                                            placeholderTextColor="#64748b"
                                            value={cancellationSearch}
                                            onChangeText={setCancellationSearch}
                                        />
                                        {cancellationSearch ? (
                                            <TouchableOpacity onPress={() => setCancellationSearch('')} style={styles.searchClear}>
                                                <Ionicons name="close-circle" size={16} color="#64748b" />
                                            </TouchableOpacity>
                                        ) : null}
                                    </View>
                                </View>

                                <ScrollView style={styles.compactList} showsVerticalScrollIndicator={false}>
                                    {filteredCancellationReasons.map((reason) => (
                                        <View key={reason.id || reason.code} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                            <View style={styles.serviceTypeRowInfo}>
                                                <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                                    {getLocalizedName(reason, reason.code)}
                                                </Text>
                                                <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                                    {TRANSLATIONS.code || 'Code:'} {reason.code} | {TRANSLATIONS.applicableTo || 'Applies to'}: {reason.applicable_to === 'master'
                                                        ? (TRANSLATIONS.appliesToMaster || 'Master')
                                                        : reason.applicable_to === 'client'
                                                            ? (TRANSLATIONS.appliesToClient || 'Client')
                                                            : (TRANSLATIONS.appliesToBoth || 'Both')
                                                    } | {reason.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                                </Text>
                                            </View>
                                            <View style={styles.serviceTypeRowActions}>
                                                <TouchableOpacity
                                                    onPress={() => setCancellationReasonModal({ visible: true, reason })}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeEditBtn, !isDark && styles.serviceTypeActionBtnLight]}
                                                >
                                                    <Ionicons name="pencil" size={16} color="#3b82f6" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeleteCancellationReason(reason.id)}
                                                    style={[styles.serviceTypeRowBtn, styles.serviceTypeDeleteBtn]}
                                                >
                                                    <Ionicons name="trash" size={16} color="#ef4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))}

                                    {filteredCancellationReasons.length === 0 && (
                                        <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                            <Ionicons name="alert-circle-outline" size={48} color="#64748b" />
                                            <Text style={styles.settingsEmptyText}>{TRANSLATIONS.noCancellationReasons || 'No cancellation reasons configured'}</Text>
                                            <Text style={styles.settingsEmptyHint}>{TRANSLATIONS.addFirstCancellationReason || 'Add your first cancellation reason to get started'}</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </View>

                    {/* Section Divider */}
                    <View style={[styles.settingsDivider, !isDark && styles.settingsDividerLight]} />

                    {/* ============================================ */}
                    {/* SERVICE TYPES SECTION */}
                    {/* ============================================ */}
                    <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                        {/* Section Header */}
                        <View style={styles.settingsSectionHeader}>
                            <View style={styles.settingsSectionTitleRow}>
                                <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                                    <Ionicons name="construct" size={20} color="#22c55e" />
                                </View>
                                <View>
                                    <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                        {TRANSLATIONS.serviceTypesTitle || 'Service Types'}
                                    </Text>
                                    <Text style={styles.settingsSectionSubtitle}>
                                        {TRANSLATIONS.serviceTypesSubtitle || 'Manage available service categories'}
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.settingsActionRow, isNarrow && styles.settingsActionRowStacked]}>
                                {/* Add Service Type Button */}
                                <TouchableOpacity
                                    onPress={() => setServiceTypeModal({ visible: true, type: null })}
                                    style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                >
                                    <Ionicons name="add" size={18} color="#fff" />
                                    <Text style={[styles.settingsBtnText, { color: '#fff' }]}>{TRANSLATIONS.addServiceType || 'Add Service Type'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => toggleSection('serviceTypes')}
                                    style={[styles.collapseBtn, !isDark && styles.collapseBtnLight]}
                                >
                                    <Ionicons name={serviceTypesCollapsed ? "chevron-down" : "chevron-up"} size={18} color={isDark ? '#94a3b8' : '#64748b'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!serviceTypesCollapsed && (
                            <ScrollView style={styles.compactList} showsVerticalScrollIndicator={false}>
                                {serviceTypes.map((type) => (
                                    <View key={type.id} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                        <View style={styles.serviceTypeRowInfo}>
                                            <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                                {getLocalizedName(type, type.code || type.id)}
                                            </Text>
                                            <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                                {TRANSLATIONS.code || 'Code:'} {type.code || type.id} | {type.is_active ? (TRANSLATIONS.active || 'Active') : (TRANSLATIONS.inactive || 'Inactive')}
                                            </Text>
                                        </View>
                                        <View style={styles.serviceTypeRowActions}>
                                            <TouchableOpacity
                                                onPress={() => setServiceTypeModal({ visible: true, type })}
                                                style={[styles.serviceTypeRowBtn, styles.serviceTypeEditBtn, !isDark && styles.serviceTypeActionBtnLight]}
                                            >
                                                <Ionicons name="pencil" size={16} color="#3b82f6" />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => handleDeleteServiceType(type.id)}
                                                style={[styles.serviceTypeRowBtn, styles.serviceTypeDeleteBtn]}
                                            >
                                                <Ionicons name="trash" size={16} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}

                                {serviceTypes.length === 0 && (
                                    <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                        <Ionicons name="construct-outline" size={48} color="#64748b" />
                                        <Text style={styles.settingsEmptyText}>{TRANSLATIONS.noServiceTypes || 'No service types configured'}</Text>
                                        <Text style={styles.settingsEmptyHint}>{TRANSLATIONS.addFirstService || 'Add your first service type to get started'}</Text>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>

                    <View style={{ height: 100 }} />
                </ScrollView>

                {/* Service Type Sidebar Drawer */}
                {renderServiceTypeSidebar()}
                {renderDistrictSidebar()}
                {renderCancellationReasonSidebar()}
            </View>
        );
}
