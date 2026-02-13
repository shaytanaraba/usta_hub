import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const normalizeTerm = (value) => String(value || '').trim().toLowerCase();
const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

export default function DispatcherPickerModal({
  pickerModal,
  setPickerModal,
  styles,
  translations,
  language,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState(null);
  const searchSeqRef = useRef(0);

  const resolveLabel = (option) => {
    const raw = option?.label;
    if (typeof raw !== 'string') return String(raw ?? '');
    return translations?.[language]?.[raw] || raw;
  };

  useEffect(() => {
    if (!pickerModal.visible) {
      searchSeqRef.current += 1;
      setSearchQuery('');
      setSearchLoading(false);
      setRemoteOptions(null);
      return;
    }
    setSearchQuery('');
    setSearchLoading(false);
    setRemoteOptions(null);
  }, [pickerModal.visible]);

  useEffect(() => {
    if (!pickerModal.visible || !pickerModal.searchable || typeof pickerModal.onSearch !== 'function') {
      return;
    }
    const query = normalizeTerm(searchQuery);
    if (!query || query.length < 2) {
      searchSeqRef.current += 1;
      setRemoteOptions(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = searchSeqRef.current + 1;
    searchSeqRef.current = requestId;
    setSearchLoading(true);

    const timer = setTimeout(() => {
      Promise.resolve(pickerModal.onSearch(query))
        .then((result) => {
          if (cancelled || requestId !== searchSeqRef.current) return;
          setRemoteOptions(Array.isArray(result) ? result : []);
        })
        .catch((error) => {
          if (cancelled || requestId !== searchSeqRef.current) return;
          console.error('[DispatcherPickerModal] remote search failed', error);
          setRemoteOptions([]);
        })
        .finally(() => {
          if (cancelled || requestId !== searchSeqRef.current) return;
          setSearchLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerModal.visible, pickerModal.searchable, pickerModal.onSearch, searchQuery]);

  const searchFields = useMemo(() => (
    Array.isArray(pickerModal.searchFields) && pickerModal.searchFields.length > 0
      ? pickerModal.searchFields
      : ['label']
  ), [pickerModal.searchFields]);

  const options = useMemo(() => {
    const source = Array.isArray(remoteOptions)
      ? remoteOptions
      : (Array.isArray(pickerModal.options) ? pickerModal.options : []);
    if (!pickerModal.searchable) return source;
    const query = normalizeTerm(searchQuery);
    const digits = normalizeDigits(searchQuery);
    if (!query && !digits) return source;

    return source.filter((option) => {
      const label = resolveLabel(option);
      const fields = [{ label }, option];

      const matchedByText = fields.some((entry) => searchFields.some((field) => String(entry?.[field] || '').toLowerCase().includes(query)));
      if (matchedByText) return true;
      if (!digits) return false;
      return fields.some((entry) => searchFields.some((field) => normalizeDigits(entry?.[field]).includes(digits)));
    });
  }, [pickerModal.options, pickerModal.searchable, remoteOptions, searchFields, searchQuery]);

  return (
    <Modal visible={pickerModal.visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setPickerModal((prev) => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.pickerContent}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
            <TouchableOpacity onPress={() => setPickerModal((prev) => ({ ...prev, visible: false }))}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {pickerModal.searchable ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                minHeight: 44,
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <Ionicons name="search" size={16} color="#64748b" />
              <TextInput
                style={{ flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 10, paddingHorizontal: 8, color: '#0f172a', borderWidth: 0 }}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={pickerModal.searchPlaceholder || translations?.[language]?.placeholderSearch || 'Search...'}
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchLoading ? (
                <ActivityIndicator size="small" color="#64748b" />
              ) : searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <FlatList
            style={styles.pickerScroll}
            data={options}
            keyExtractor={(opt, index) => String(opt?.id ?? index)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = String(pickerModal.value ?? '') === String(item?.id ?? '');
              return (
                <TouchableOpacity
                  style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                  onPress={() => {
                    if (pickerModal.onChange) pickerModal.onChange(item.id);
                    if (pickerModal.closeOnSelect !== false) {
                      setPickerModal((prev) => ({ ...prev, visible: false }));
                    }
                  }}
                >
                  <View style={styles.pickerOptionInfo}>
                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>
                      {resolveLabel(item)}
                      {typeof item?.count === 'number' ? ` (${item.count})` : ''}
                    </Text>
                    {item?.subtitle ? (
                      <Text style={[styles.pickerOptionSubText, selected && styles.pickerOptionSubTextActive]}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={18} color="#3b82f6" /> : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={(
              <Text style={{ color: '#64748b', textAlign: 'center', paddingVertical: 16 }}>
                {searchLoading
                  ? (translations?.[language]?.loading || 'Loading...')
                  : (pickerModal.emptyText || translations?.[language]?.msgNoMatch || 'No matching options')}
              </Text>
            )}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
