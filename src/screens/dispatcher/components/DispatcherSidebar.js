import React from 'react';
import { Modal, View, Animated, TouchableOpacity, Text, Image } from 'react-native';

export default function DispatcherSidebar({
  visible,
  styles,
  isDark,
  isPartner,
  activeTab,
  onSelectTab,
  onClose,
  translations,
  language,
  needsAttentionCount,
  onToggleTheme,
  cycleLanguage,
  user,
  onLogout,
}) {
  const roleTitle = isPartner
    ? (translations[language].partnerPro || 'Partner Pro')
    : (translations[language].dispatcherPro || 'Dispatcher Pro');

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.sidebarOverlay}>
        <Animated.View style={[styles.sidebarContainer, !isDark && styles.sidebarContainerLight]}>
          <View style={[styles.sidebarHeader, !isDark && styles.sidebarHeaderLight]}>
            <View style={styles.sidebarBrand}>
              <Image source={require('../../../../assets/circle.png')} style={styles.sidebarBrandLogo} />
              <Text style={[styles.sidebarTitle, !isDark && styles.textDark]}>{roleTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sidebarClose}>
              <Text style={styles.sidebarCloseText}>X</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sidebarNav}>
            {isPartner ? (
              <>
                <TouchableOpacity
                  style={[styles.sidebarNavItem, activeTab === 'stats' && styles.sidebarNavItemActive]}
                  onPress={() => onSelectTab('stats')}
                >
                  <Text style={[styles.sidebarNavText, activeTab === 'stats' && styles.sidebarNavTextActive]}>
                    {translations[language].stats || 'Statistics'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.sidebarNavItem, activeTab === 'stats' && styles.sidebarNavItemActive]}
                onPress={() => onSelectTab('stats')}
              >
                <Text style={[styles.sidebarNavText, activeTab === 'stats' && styles.sidebarNavTextActive]}>
                  {translations[language].stats || 'Statistics'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sidebarNavItem, activeTab === 'queue' && styles.sidebarNavItemActive]}
              onPress={() => onSelectTab('queue')}
            >
              <View style={styles.sidebarNavRow}>
                <Text style={[styles.sidebarNavText, activeTab === 'queue' && styles.sidebarNavTextActive]}>
                  {translations[language].ordersQueue}
                </Text>
                {needsAttentionCount > 0 && (
                  <View style={styles.sidebarBadge}>
                    <Text style={styles.sidebarBadgeText}>{needsAttentionCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sidebarNavItem, activeTab === 'create' && styles.sidebarNavItemActive]}
              onPress={() => onSelectTab('create')}
            >
              <Text style={[styles.sidebarNavText, activeTab === 'create' && styles.sidebarNavTextActive]}>
                {translations[language].createOrder}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sidebarNavItem, activeTab === 'settings' && styles.sidebarNavItemActive]}
              onPress={() => onSelectTab('settings')}
            >
              <Text style={[styles.sidebarNavText, activeTab === 'settings' && styles.sidebarNavTextActive]}>
                {translations[language].sectionSettings || 'Settings'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.sidebarFooter, !isDark && styles.sidebarFooterLight]}>
            <View style={styles.sidebarButtonRow}>
              <TouchableOpacity style={[styles.sidebarSmallBtn, !isDark && styles.sidebarBtnLight]} onPress={onToggleTheme}>
                <Text style={[styles.sidebarThemeIcon, !isDark && styles.textDark]}>{isDark ? '\u2600' : '\u263E'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sidebarLangBtn, !isDark && styles.sidebarBtnLight]}
                onPress={cycleLanguage}
              >
                <Text style={[styles.sidebarLangText, !isDark && styles.textDark, { fontSize: 24 }]}>
                  {language === 'en'
                    ? '\uD83C\uDDEC\uD83C\uDDE7'
                    : language === 'ru'
                      ? '\uD83C\uDDF7\uD83C\uDDFA'
                      : '\uD83C\uDDF0\uD83C\uDDEC'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.sidebarUserCard, !isDark && styles.sidebarBtnLight]}>
              <View style={styles.sidebarUserAvatar}>
                <Text style={styles.sidebarUserAvatarText}>
                  {user?.full_name ? user.full_name.split(' ').map((name) => name[0]).join('').substring(0, 2) : (isPartner ? 'PR' : 'DP')}
                </Text>
              </View>
              <View style={styles.sidebarUserInfo}>
                <Text style={[styles.sidebarUserName, !isDark && styles.textDark]} numberOfLines={1}>
                  {user?.full_name || (isPartner ? (translations[language].partnerRole || 'Partner') : (translations[language].dispatcherRole || 'Dispatcher'))}
                </Text>
                <Text style={styles.sidebarUserStatus}>{translations[language].online}</Text>
              </View>
              <TouchableOpacity onPress={onLogout} style={styles.sidebarLogoutBtn}>
                <Text style={styles.sidebarLogoutText}>{translations[language].exit}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        <TouchableOpacity style={styles.sidebarBackdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

