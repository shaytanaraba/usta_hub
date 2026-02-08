import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AdminPeopleTab(props) {
    const {
        styles,
        isDark,
        TRANSLATIONS,
        peopleView,
        setPeopleView,
        setAddUserRole,
        setShowAddUserModal,
        renderMasters,
        renderStaff,
        renderHeader,
    } = props;

    return (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {renderHeader(TRANSLATIONS.tabPeople || 'People Management')}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#0f172a' : '#e2e8f0', padding: 4, borderRadius: 100, borderWidth: 1, borderColor: isDark ? '#334155' : '#cbd5e1' }}>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'masters' && styles.tabBtnActive, !isDark && peopleView !== 'masters' && styles.tabBtnLight, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('masters')}>
                        <Text style={[styles.tabBtnText, peopleView === 'masters' && styles.tabBtnTextActive, !isDark && peopleView !== 'masters' && styles.textDark]}>{TRANSLATIONS.peopleMasters || 'Masters'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'staff' && styles.tabBtnActive, !isDark && peopleView !== 'staff' && styles.tabBtnLight, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('staff')}>
                        <Text style={[styles.tabBtnText, peopleView === 'staff' && styles.tabBtnTextActive, !isDark && peopleView !== 'staff' && styles.textDark]}>{TRANSLATIONS.peopleDispatchers || 'Dispatchers'}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: peopleView === 'masters' ? '#22c55e' : '#3b82f6', paddingHorizontal: 16, paddingVertical: 10, marginTop: 0 }]}
                    onPress={() => {
                        setAddUserRole(peopleView === 'masters' ? 'master' : 'dispatcher');
                        setShowAddUserModal(true);
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="person-add" size={16} color="#fff" />
                        <Text style={styles.actionButtonText}>{peopleView === 'masters' ? (TRANSLATIONS.addMaster || 'Add Master') : (TRANSLATIONS.addDispatcher || 'Add Dispatcher')}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {peopleView === 'masters' ? renderMasters() : renderStaff()}
        </View>
    );
}