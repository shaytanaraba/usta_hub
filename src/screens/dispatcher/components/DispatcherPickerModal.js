import React from 'react';
import { Modal, TouchableOpacity, View, Text, ScrollView } from 'react-native';

export default function DispatcherPickerModal({
  pickerModal,
  setPickerModal,
  styles,
  translations,
  language,
}) {
  return (
    <Modal visible={pickerModal.visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setPickerModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
            <TouchableOpacity onPress={() => setPickerModal((prev) => ({ ...prev, visible: false }))}>
              <Text style={styles.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerScroll}>
            {pickerModal.options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.pickerOption, pickerModal.value === opt.id && styles.pickerOptionActive]}
                onPress={() => {
                  if (pickerModal.onChange) pickerModal.onChange(opt.id);
                  setPickerModal((prev) => ({ ...prev, visible: false }));
                }}
              >
                <Text style={[styles.pickerOptionText, pickerModal.value === opt.id && styles.pickerOptionTextActive]}>
                  {(translations?.[language]?.[opt.label] || opt.label)}
                  {typeof opt.count === 'number' ? ` (${opt.count})` : ''}
                </Text>
                {pickerModal.value === opt.id && <Text style={styles.pickerCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
