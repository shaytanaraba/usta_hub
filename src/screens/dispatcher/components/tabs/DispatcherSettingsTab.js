import React from 'react';
import { Animated, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

const LANGUAGE_FLAGS = {
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  ru: '\uD83C\uDDF7\uD83C\uDDFA',
  kg: '\uD83C\uDDF0\uD83C\uDDEC',
};

const THEME_OPTIONS = [
  { id: 'light', icon: '\u2600', labelKey: 'settingsThemeLight', fallback: 'Light' },
  { id: 'dark', icon: '\u263E', labelKey: 'settingsThemeDark', fallback: 'Dark' },
];

const normalizeLabelCasing = (value) => {
  if (typeof value !== 'string') return value;
  const letters = Array.from(value).filter((char) => char.toLocaleLowerCase() !== char.toLocaleUpperCase());
  if (letters.length === 0) return value;
  const isAllUpper = letters.every((char) => char === char.toLocaleUpperCase());
  if (!isAllUpper) return value;
  const lower = value.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
};

export default function DispatcherSettingsTab({
  styles,
  isDark,
  translations,
  language,
  user,
  setLanguage,
  setIsDark,
  loading,
  skeletonPulse,
}) {
  const TRANSLATIONS = translations;
  const profileName = user?.full_name || 'Dispatcher';
  const profilePhone = user?.phone || user?.phone_number || user?.phoneNumber || '-';
  const profileEmail = user?.email || '-';
  const profileRole = TRANSLATIONS[language].dispatcherRole || 'Dispatcher';
  const isEnabled = user?.is_verified === true;
  const accessLabelRaw = isEnabled
    ? (TRANSLATIONS[language].verified || 'Verified')
    : (TRANSLATIONS[language].unverified || 'Unverified');
  const accessLabel = normalizeLabelCasing(accessLabelRaw);
  const themeMode = isDark ? 'dark' : 'light';
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
  const renderValueSkeleton = (style) => (
    <Animated.View style={[style, { opacity: skeletonPulse }]} />
  );

  return (
    <View style={styles.settingsContainer}>
      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].sectionProfile || 'Profile'}</Text>
        <View style={styles.settingsProfileRow}>
          <View style={[styles.settingsAvatar, loading && styles.settingsAvatarSkeleton]}>
            {!loading && <Text style={styles.settingsAvatarText}>{initials}</Text>}
          </View>
          <View style={styles.settingsProfileInfo}>
            {loading
              ? renderValueSkeleton(styles.settingsValueSkeleton)
              : <Text style={[styles.settingsValue, !isDark && styles.textDark]}>{profileName}</Text>}
            <View style={[styles.settingsRoleChip, !isDark && styles.settingsRoleChipLight]}>
              {loading
                ? renderValueSkeleton(styles.settingsRoleSkeleton)
                : (
                  <Text style={[styles.settingsRoleText, !isDark && styles.settingsRoleTextLight]}>
                    {profileRole}
                  </Text>
                )}
            </View>
          </View>
        </View>
        {loading
          ? renderValueSkeleton(styles.settingsMetaSkeleton)
          : <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].phone}: {profilePhone}</Text>}
        {loading
          ? renderValueSkeleton(styles.settingsMetaSkeletonShort)
          : <Text style={[styles.settingsMeta, !isDark && styles.textSecondary]}>{profileEmail}</Text>}
      </View>

      <View style={[styles.settingsCard, !isDark && styles.cardLight]}>
        <Text style={[styles.settingsTitle, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].status || 'Status'}</Text>
        <View style={[styles.settingsStatusRow, !isDark && styles.settingsStatusRowLight]}>
          <View
            style={[
              styles.settingsStatusDot,
              { backgroundColor: loading ? (isDark ? '#64748b' : '#cbd5e1') : (isEnabled ? '#22c55e' : '#ef4444') },
            ]}
          />
          {loading
            ? renderValueSkeleton(styles.settingsStatusSkeleton)
            : <Text style={[styles.settingsStatusValue, !isDark && styles.settingsStatusValueLight]}>{accessLabel}</Text>}
        </View>
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
                  styles.settingsFlag,
                  language === code && styles.settingsFlagActive,
                ]}
              >
                {LANGUAGE_FLAGS[code] || code.toUpperCase()}
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
          <View style={[styles.settingsThemeSwitch, !isDark && styles.settingsThemeSwitchLight]}>
            {THEME_OPTIONS.map((option) => {
              const isActive = themeMode === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.settingsThemeOption,
                    isActive && styles.settingsThemeOptionActive,
                    !isDark && styles.settingsThemeOptionLight,
                    !isDark && isActive && styles.settingsThemeOptionActiveLight,
                  ]}
                  onPress={() => setIsDark(option.id === 'dark')}
                >
                  <Text
                    style={[
                      styles.settingsThemeOptionIcon,
                      isActive && styles.settingsThemeOptionIconActive,
                      !isDark && styles.settingsThemeOptionIconLight,
                      !isDark && isActive && styles.settingsThemeOptionIconActiveLight,
                    ]}
                  >
                    {option.icon}
                  </Text>
                  <Text
                    style={[
                      styles.settingsThemeOptionText,
                      isActive && styles.settingsThemeOptionTextActive,
                      !isDark && styles.settingsThemeOptionTextLight,
                      !isDark && isActive && styles.settingsThemeOptionTextActiveLight,
                    ]}
                  >
                    {TRANSLATIONS[language][option.labelKey] || option.fallback}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
