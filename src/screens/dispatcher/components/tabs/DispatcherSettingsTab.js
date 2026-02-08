import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

export default function DispatcherSettingsTab({
  styles,
  isDark,
  translations,
  language,
  user,
  setLanguage,
  setIsDark,
}) {
  const TRANSLATIONS = translations;
  const profileName = user?.full_name || 'Dispatcher';
  const profilePhone = user?.phone || user?.phone_number || user?.phoneNumber || '-';
  const profileEmail = user?.email || '-';
  const profileRole = TRANSLATIONS[language].dispatcherRole || 'Dispatcher';
  const initials = profileName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleSupport = () => Linking.openURL('tel:+996500105415');
  const handleWhatsApp = () => Linking.openURL('https://wa.me/996500105415');
  const handleTelegram = () => Linking.openURL('https://t.me/konevor');

  return (
    <View style={styles.settingsContainer}>
      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].sectionProfile || 'Profile'}</Text>
        <View style={styles.settingsProfileRow}>
          <View style={styles.settingsAvatar}>
            <Text style={styles.settingsAvatarText}>{initials}</Text>
          </View>
          <View style={styles.settingsProfileInfo}>
            <Text style={[styles.settingsValue, !isDark && styles.textDark]}>{profileName}</Text>
            <View style={[styles.settingsRoleChip, !isDark && styles.settingsRoleChipLight]}>
              <Text style={[styles.settingsRoleText, !isDark && styles.settingsRoleTextLight]}>
                {profileRole}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].phone}: {profilePhone}</Text>
        <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{profileEmail}</Text>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsLanguage || 'Language'}</Text>
        <View style={styles.settingsOptionsRow}>
          {['en', 'ru', 'kg'].map((code) => (
            <TouchableOpacity
              key={code}
              style={[
                styles.settingsOption,
                language === code && styles.settingsOptionActive,
                !isDark && styles.settingsOptionLight,
                !isDark && language === code && styles.settingsOptionActiveLight,
              ]}
              onPress={() => {
                if (language !== code) {
                  setLanguage?.(code);
                }
              }}
            >
              <Text
                style={[
                  styles.settingsOptionText,
                  language === code && styles.settingsOptionTextActive,
                  !isDark && styles.settingsOptionTextLight,
                  !isDark && language === code && styles.settingsOptionTextActiveLight,
                ]}
              >
                {code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <View style={styles.settingsToggleRow}>
          <View>
            <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsTheme || 'Theme'}</Text>
            <Text style={[styles.settingsHint, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsThemeHint || 'Adjust appearance'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.settingsToggle, { backgroundColor: isDark ? '#2563eb' : '#e2e8f0' }]}
            onPress={() => setIsDark(!isDark)}
          >
            <View style={[styles.settingsToggleThumb, { left: isDark ? 22 : 3 }]} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].settingsSupport || 'Support'}</Text>
        <View style={styles.settingsSupportList}>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleSupport}
          >
            <View style={styles.settingsSupportLeft}>
              <Feather
                name="phone"
                size={16}
                color={isDark ? '#94a3b8' : '#64748b'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportPhone || 'Call Support'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>+996 500 105 415</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleWhatsApp}
          >
            <View style={styles.settingsSupportLeft}>
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={isDark ? '#22c55e' : '#16a34a'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportWhatsApp || 'WhatsApp'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>+996 500 105 415</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsSupportRow, !isDark && styles.settingsSupportRowLight]}
            onPress={handleTelegram}
          >
            <View style={styles.settingsSupportLeft}>
              <Ionicons
                name="paper-plane"
                size={16}
                color={isDark ? '#60a5fa' : '#2563eb'}
                style={styles.settingsSupportIcon}
              />
              <Text style={[styles.settingsSupportLabel, !isDark && styles.textDark]}>
                {TRANSLATIONS[language].settingsSupportTelegram || 'Telegram'}
              </Text>
            </View>
            <Text style={[styles.settingsSupportValue, !isDark && styles.textSecondary]}>@konevor</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
