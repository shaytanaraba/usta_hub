/**
 * Login Screen - v7
 * Refined UI based on feedback:
 * - Logo visibility fix (using contain + proper spacing)
 * - Switchers moved below login box (not fixed at bottom)
 * - Improved scroll layout
 */

import React, { useState, useRef } from 'react';
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
  Linking,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Moon, Sun } from 'lucide-react-native';
import authService from '../services/auth';
import { useToast } from '../contexts/ToastContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';

const LOG_PREFIX = '[LoginScreen]';
const BRAND = {
  red: '#dc2626',
  yellow: '#FDE047', // Matching the logo background approx
};
const SUPPORT_PHONE = '+996555000000';
const logoImage = require('../../logo/logo_complex-1.png');

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Flag components
const FlagUS = () => (
  <View style={styles.flagContainer}>
    <Text style={styles.flagEmoji}>🇺🇸</Text>
  </View>
);

const FlagRU = () => (
  <View style={styles.flagContainer}>
    <Text style={styles.flagEmoji}>🇷🇺</Text>
  </View>
);

const FlagKG = () => (
  <View style={styles.flagContainer}>
    <Text style={styles.flagEmoji}>🇰🇬</Text>
  </View>
);

const getFlag = (lang) => {
  switch (lang) {
    case 'en': return <FlagUS />;
    case 'ru': return <FlagRU />;
    case 'kg': return <FlagKG />;
    default: return <FlagRU />;
  }
};

function LoginContent({ navigation }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { language, cycleLanguage, t } = useLocalization();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { showToast } = useToast();

  // Animated value for scroll position
  const scrollY = useRef(new Animated.Value(0)).current;

  // Dynamic matte opacity based on scroll
  const matteOpacity = scrollY.interpolate({
    inputRange: [0, 200],
    outputRange: [0, 0.8], // Starts clear, becomes dark/opaque overlay
    extrapolate: 'clamp',
  });

  const handleLogin = async () => {
    // Standard login logic
    console.log(`${LOG_PREFIX} Login attempt: ${email}`);
    setError('');

    if (!email.trim() || !password) {
      setError(t('loginErrorMissing'));
      return;
    }

    setLoading(true);

    try {
      const result = await authService.loginUser(email, password);

      if (result.success) {
        console.log(`${LOG_PREFIX} Login successful`);
        showToast?.(t('loginSuccess'), 'success');
        navigation.reset({
          index: 0,
          routes: [{
            name: result.redirectScreen,
            params: { user: result.user }
          }],
        });
      } else {
        console.warn(`${LOG_PREFIX} Login failed`);
        setError(result.message);
        showToast?.(result.message, 'error');
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Login error:`, err);
      setError(t('loginErrorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleSupport = () => {
    Linking.openURL('tel:+996500105415');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/996500105415');
  };

  const handleTelegram = () => {
    Linking.openURL('https://t.me/konevor');
  };

  // Helper to get localized error message
  const getErrorMessage = (msg) => {
    if (!msg) return null;
    if (msg.toLowerCase().includes('invalid email') || msg.toLowerCase().includes('invalid login')) {
      return t('loginErrorInvalidCredentials') || "Неверный email или пароль";
    }
    return msg;
  };

  const displayError = getErrorMessage(error);

  // Basic email validation regex
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isEmailValid = isValidEmail(email);

  return (
    <View style={[styles.container, { backgroundColor: BRAND.yellow }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Hero Section with Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={logoImage}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* Matte Overlay (covers the logo/bg when scrolling) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.matteOverlay,
          {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            opacity: matteOpacity
          }
        ]}
      />

      {/* Main Scrollable Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          {/* Bottom Sheet Card */}
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.bgSecondary,
                borderColor: theme.borderPrimary
              }
            ]}
          >
            {/* Sheet Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: theme.borderSecondary }]} />

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
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  {isEmailValid && (
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
                    style={[styles.input, { color: theme.textPrimary }, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                    placeholder={t('loginPasswordPlaceholder')}
                    placeholderTextColor={theme.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!loading}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { backgroundColor: BRAND.yellow, opacity: loading ? 0.7 : 1 }
                ]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.loginButtonText}>{t('loginButton')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Support & Footer */}
            <View style={styles.footerContainer}>
              <View style={styles.supportLinks}>
                <TouchableOpacity onPress={handleSupport} style={styles.iconLink}>
                  <Feather name="phone" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleWhatsApp} style={styles.iconLink}>
                  <Ionicons name="logo-whatsapp" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleTelegram} style={styles.iconLink}>
                  <Ionicons name="paper-plane" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.footerText, { color: theme.textMuted, marginTop: 10 }]}>
                (c) 2026 Master.kg
              </Text>
            </View>

            {/* Switchers moved here */}
            <View style={[styles.inlineSwitchers, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[styles.switchPill, { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }]}
                onPress={toggleTheme}
              >
                {isDark ? (
                  <Feather name="moon" size={18} color={theme.textPrimary} />
                ) : (
                  <Feather name="sun" size={18} color={theme.textPrimary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.switchPill, { backgroundColor: theme.bgInput, borderColor: theme.borderSecondary }]}
                onPress={cycleLanguage}
              >
                <Text style={{ fontSize: 20 }}>
                  {language === 'en' ? '🇺🇸' : language === 'ru' ? '🇷🇺' : '🇰🇬'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </View>
        </Animated.ScrollView>
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
    height: SCREEN_HEIGHT * 0.45, // Logo takes top 45%
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
  scrollContent: {
    paddingTop: SCREEN_HEIGHT * 0.40, // Start sheet lower to reveal logo
    minHeight: SCREEN_HEIGHT,
    paddingBottom: 20,
  },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -5 },
    elevation: 5,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    marginBottom: 20,
    opacity: 0.5,
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
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  supportCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  supportIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  supportLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  supportPhone: {
    fontSize: 14,
    fontWeight: '700',
  },
  supportActions: {
    flexDirection: 'row',
    gap: 10,
  },
  supportAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  // New styles for inline switchers
  inlineSwitchers: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 10,
  },
  switchPill: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  flagContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagEmoji: {
    fontSize: 24,
  },
  loginButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  loginButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  successIcon: {
    paddingLeft: 4,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 32,
  },
  supportLinks: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLink: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
  },
});
