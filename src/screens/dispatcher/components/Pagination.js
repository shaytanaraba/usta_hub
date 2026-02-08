import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';

export default function Pagination({ current, total, onPageChange, styles }) {
  if (total <= 1) return null;

  return (
    <View style={styles.pagination}>
      {Array.from({ length: total }, (_, index) => index + 1).map((page) => (
        <TouchableOpacity
          key={page}
          style={[styles.pageBtn, current === page && styles.pageBtnActive]}
          onPress={() => onPageChange(page)}
        >
          <Text style={[styles.pageBtnText, current === page && styles.pageBtnTextActive]}>
            {page}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
