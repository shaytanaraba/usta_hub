/**
 * Login Screen - v7
 * Refined UI based on feedback:
 * - Logo visibility fix (using contain + proper spacing)
 * - Switchers moved below login box (not fixed at bottom)
 * - Improved scroll layout
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Image,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import authService from '../services/auth';
import { useToast } from '../contexts/ToastContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';

const LOG_PREFIX = '[LoginScreen]';
const BRAND = {
  red: '#dc2626',
  yellow: '#FDE047', // Matching the logo background approx
};
const SUPPORT_PHONE = '+996500105415';
const SUPPORT_WHATSAPP = 'https://wa.me/996500105415';
const SUPPORT_TELEGRAM = 'https://t.me/konevor';
const logoImage = require('../../logo/logo_complex-1.png');

const FLAG_EN = '\u{1F1EC}\u{1F1E7}';
const FLAG_RU = '\u{1F1F7}\u{1F1FA}';
const FLAG_KG = '\u{1F1F0}\u{1F1EC}';

function LoginContent({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { language, cycleLanguage, t } = useLocalization();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const isLargeScreen = screenWidth >= 1024;
  const logoHeight = screenHeight * 0.45;
  const sheetMaxWidth = isLargeScreen ? 920 : undefined;
  const collapsedHeight = Math.min(360, Math.max(240, screenHeight * 0.35));
  const expandedHeight = Math.min(
    screenHeight,
    Math.max(collapsedHeight + 160, screenHeight * 0.88)
  );

  const { showToast } = useToast();

  const [isExpanded, setIsExpanded] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const passwordInputRef = useRef(null);

  const sheetHeight = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedHeight, expandedHeight],
    extrapolate: 'clamp',
  });

  // Dynamic matte opacity based on sheet expansion
  const matteOpacity = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.75],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    Animated.timing(sheetAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isExpanded, sheetAnim]);

  const expandSheet = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const toggleSheet = () => {
    setIsExpanded((prev) => !prev);
  };

  const handleLogin = async () => {
    // Standard login logic
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Login attempt`);
    }
    setError('');

    if (!email.trim() || !password) {
      setError(t('loginErrorMissing'));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t('loginErrorInvalidEmail') || t('loginErrorInvalidCredentials') || 'Invalid email');
      return;
    }

    setLoading(true);

    try {
      const result = await authService.loginUser(email, password);

      if (result.success) {
        if (__DEV__) {
          console.log(`${LOG_PREFIX} Login successful`);
        }
        showToast?.(t('loginSuccess'), 'success');
        if (result.redirectScreen) {
          navigation.reset({
            index: 0,
            routes: [{
              name: result.redirectScreen,
              params: { user: result.user }
            }],
          });
        } else {
          setError(t('loginErrorGeneric'));
          showToast?.(t('loginErrorGeneric'), 'error');
        }
      } else {
        if (__DEV__) {
          console.warn(`${LOG_PREFIX} Login failed`);
        }
        setError(result.message);
        showToast?.(result.message, 'error');
      }
    } catch (err) {
      if (__DEV__) {
        console.error(`${LOG_PREFIX} Login error:`, err);
      }
      setError(t('loginErrorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const openExternal = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showToast?.(t('linkUnavailable') || 'Unable to open link', 'error');
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      if (__DEV__) {
        console.warn(`${LOG_PREFIX} Failed to open link`, err);
      }
      showToast?.(t('linkUnavailable') || 'Unable to open link', 'error');
    }
  };

  const handleSupport = () => {
    openExternal(`tel:${SUPPORT_PHONE}`);
  };

  const handleWhatsApp = () => {
    openExternal(SUPPORT_WHATSAPP);
  };

  const handleTelegram = () => {
    openExternal(SUPPORT_TELEGRAM);
  };

  // Helper to get localized error message
  const getErrorMessage = (msg) => {
    if (!msg) return null;
    if (typeof msg !== 'string') {
      return t('loginErrorGeneric');
    }
    const normalized = msg.toLowerCase();
    if (normalized.includes('invalid email') || normalized.includes('invalid login')) {
      return t('loginErrorInvalidCredentials') || 'Invalid email or password';
    }
    return msg;
  };

  const displayError = getErrorMessage(error);

  // Basic email validation regex
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isEmailValid = isValidEmail(email);
  const canSubmit = !loading && email.trim().length > 0 && password.length > 0 && isEmailValid;
  const languageFlag = language === 'en' ? FLAG_EN : language === 'ru' ? FLAG_RU : FLAG_KG;
  const resolveLabel = (key, fallback) => {
    const value = t(key);
    return !value || value === key ? fallback : value;
  };
  const supportLabel = resolveLabel('supportLabel', 'Support');
  const supportCallLabel = resolveLabel('supportCall', 'Call');
  const supportWhatsAppLabel = resolveLabel('supportWhatsApp', 'WhatsApp');
  const supportTelegramLabel = resolveLabel('supportTelegram', 'Telegram');
  const preferencesLabel = resolveLabel('preferencesLabel', 'Preferences');
  const themeLightLabel = resolveLabel('themeLight', 'Light');
  const themeDarkLabel = resolveLabel('themeDark', 'Dark');

  return (
    <View style={[styles.container, { backgroundColor: BRAND.yellow }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Hero Section with Logo */}
      <View style={[styles.logoContainer, { height: logoHeight }]}>
        <Image
          source={logoImage}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* Matte Overlay (covers the logo/bg as sheet expands) */}
      <Animated.View
        style={[
          styles.matteOverlay,
          {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            opacity: matteOpacity,
            pointerEvents: 'none'
          }
        ]}
      />

      {/* Main Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.sheetHost}>
          {/* Bottom Sheet Card */}
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.bgSecondary,
                borderColor: theme.borderPrimary,
                maxWidth: sheetMaxWidth,
                height: sheetHeight
              }
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetHandleArea}
              onPress={toggleSheet}
            >
              <View style={[styles.sheetHandle, { backgroundColor: theme.borderSecondary }]} />
            </TouchableOpacity>

            <Animated.ScrollView
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={expandSheet}
              onTouchStart={expandSheet}
              scrollEventThrottle={16}
            >
              <View style={styles.sheetBody}>
                {/* Login Card */}
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.bgCard,
                      borderColor: theme.borderPrimary
                    }
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
                    {t('loginTitle')}
                  </Text>

                  {displayError ? (
                    <View
                      style={[
                        styles.errorContainer,
                        {
                          borderColor: theme.accentDanger,
                          backgroundColor: `${theme.accentDanger}15`
                        }
                      ]}
                    >
                      <Text style={[styles.errorText, { color: theme.accentDanger }]}>
                        {displayError}
                      </Text>
                    </View>
                  ) : null}

                  {/* Form Inputs */}
                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('loginEmail')}</Text>
                    <View style={[styles.inputRow, { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }]}>
                      <Feather name="mail" size={18} color={theme.textMuted} />
                      <TextInput
                        style={[styles.input, { color: theme.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                        placeholder={t('loginEmailPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        onFocus={expandSheet}
                        keyboardType="email-address"
                        inputMode="email"
                        autoComplete="email"
                        textContentType="username"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => passwordInputRef.current?.focus()}
                        editable={!loading}
                      />
                      {isEmailValid && email.trim().length > 0 && (
                        <View style={styles.successIcon}>
                          <Feather name="check-circle" size={18} color="#22c55e" />
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('loginPassword')}</Text>
                    <View style={[styles.inputRow, { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }]}>
                      <Feather name="lock" size={18} color={theme.textMuted} />
                      <TextInput
                        ref={passwordInputRef}
                        style={[styles.input, { color: theme.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                        placeholder={t('loginPasswordPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        onFocus={expandSheet}
                        secureTextEntry
                        textContentType="password"
                        autoComplete="password"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="go"
                        onSubmitEditing={() => {
                          if (canSubmit) {
                            handleLogin();
                          }
                        }}
                        editable={!loading}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.loginButton,
                      { backgroundColor: BRAND.yellow, opacity: canSubmit ? 1 : 0.6 }
                    ]}
                    onPress={handleLogin}
                    disabled={!canSubmit}
                  >
                    {loading ? (
                      <ActivityIndicator color="#0f172a" />
                    ) : (
                      <Text style={styles.loginButtonText}>{t('loginButton')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sheetFooter}>
                <View style={styles.utilityRow}>
                  <Text style={[styles.utilityLabel, { color: theme.textMuted }]}>{supportLabel}</Text>
                  <View style={styles.utilityGroup}>
                    <TouchableOpacity
                      onPress={handleSupport}
                      style={[
                        styles.chipButton,
                        { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }
                      ]}
                    >
                      <Feather name="phone" size={18} color={theme.textSecondary} />
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>{supportCallLabel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleWhatsApp}
                      style={[
                        styles.chipButton,
                        { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }
                      ]}
                    >
                      <Ionicons name="logo-whatsapp" size={18} color={theme.textSecondary} />
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>{supportWhatsAppLabel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleTelegram}
                      style={[
                        styles.chipButton,
                        { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }
                      ]}
                    >
                      <Ionicons name="paper-plane" size={18} color={theme.textSecondary} />
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>{supportTelegramLabel}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.utilityRow}>
                  <Text style={[styles.utilityLabel, { color: theme.textMuted }]}>{preferencesLabel}</Text>
                  <View style={styles.utilityGroup}>
                    <TouchableOpacity
                      style={[
                        styles.chipButton,
                        { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }
                      ]}
                      onPress={toggleTheme}
                    >
                      {isDark ? (
                        <Feather name="moon" size={18} color={theme.textSecondary} />
                      ) : (
                        <Feather name="sun" size={18} color={theme.textSecondary} />
                      )}
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>
                        {isDark ? themeDarkLabel : themeLightLabel}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.chipButton,
                        { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }
                      ]}
                      onPress={cycleLanguage}
                    >
                      <Text style={styles.chipIconText}>{languageFlag}</Text>
                      <Text style={[styles.chipText, { color: theme.textSecondary }]}>
                        {language.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.footerText, { color: theme.textMuted }]}>
                  (c) 2026 Master.kg
                </Text>
              </View>
            </Animated.ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function LoginScreen(props) {
  return (
    <ThemeProvider>
      <LoginContent {...props} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    zIndex: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  matteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1, // On top of logo, below sheet
  },
  keyboardView: {
    flex: 1,
    zIndex: 2, // Content on top of everything
  },
  sheetHost: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px -5px 18px rgba(0,0,0,0.10)' }
      : { shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: -5 }, elevation: 5 }),
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    opacity: 0.5,
  },
  sheetScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sheetBody: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 8,
  },
  sheetFooter: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  utilityRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 12,
    marginBottom: 12,
  },
  utilityLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  utilityGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipIconText: {
    fontSize: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorContainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    fontSize: 16,
    flex: 1,
  },
  loginButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 2px 8px rgba(0,0,0,0.10)' }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }),
  },
  loginButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  successIcon: {
    paddingLeft: 4,
  },
  footerText: {
    fontSize: 12,
  },
});


