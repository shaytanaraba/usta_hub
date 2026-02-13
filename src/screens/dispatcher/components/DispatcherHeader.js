import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';

const getTitle = (activeTab, labels) => {
  if (activeTab === 'queue') return labels.ordersQueue;
  if (activeTab === 'stats') return labels.stats || 'Statistics';
  if (activeTab === 'earnings') return labels.partnerEarnings || labels.sectionEarnings || 'Earnings';
  if (activeTab === 'settings') return labels.sectionSettings || 'Settings';
  return labels.createOrder;
};

export default function DispatcherHeader({
  styles,
  isDark,
  activeTab,
  labels,
  onOpenSidebar,
  onRefresh,
}) {
  return (
    <View style={[styles.header, !isDark && styles.headerLight]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={onOpenSidebar} style={[styles.menuBtn, !isDark && styles.btnLight]}>
          <Text style={[styles.menuBtnText, !isDark && styles.textDark]}>{'\u2630'}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, !isDark && styles.textDark]}>
          {getTitle(activeTab, labels)}
        </Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, !isDark && styles.btnLight]}>
          <Text style={[styles.iconText, !isDark && styles.textDark]}>{'\u21BB'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
