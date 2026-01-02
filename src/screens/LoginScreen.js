import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import auth from '../services/auth';
import { useResponsive } from '../utils/responsive';
import { useToast } from '../contexts/ToastContext';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState('client');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    phone: '',
    licenseNumber: '',
    serviceArea: '',
    experience: '',
  });
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(false);

  const { isDesktop } = useResponsive();
  const { showToast } = useToast();

  // Clear form when switching between login/register tabs
  useEffect(() => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      name: '',
      phone: '',
      licenseNumber: '',
      serviceArea: '',
      experience: '',
    });
    setSpecializations([]);
  }, [isLogin]);

  const specializationsList = [
    'residential',
    'commercial',
    'emergency',
    'installations',
    'repairs',
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSpecialization = (spec) => {
    setSpecializations(prev =>
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
  };

  const handleLogin = async () => {


    if (!formData.email || !formData.password) {
      const errorMsg = 'Please fill in all required fields';
      console.error('Login validation error:', errorMsg);
      Alert.alert('Error', errorMsg);
      return;
    }

    setLoading(true);

    const result = await auth.loginUser(formData.email, formData.password);
    setLoading(false);



    if (result.success) {

      showToast('Login successful!', 'success');
      navigation.reset({
        index: 0,
        routes: [{ name: result.redirectScreen }],
      });
    } else {
      console.error('Login failed:', result.message);
      showToast(result.message || 'Invalid credentials', 'error');
    }
  };

  const handleRegister = async () => {


    const userData = {
      ...formData,
      userType,
      specializations,
    };

    setLoading(true);

    const result = await auth.registerUser(userData);
    setLoading(false);



    if (result.success) {
      console.log('Registration successful!');
      // Switch to login tab and clear form
      setIsLogin(true);
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
        name: '',
        phone: '',
        licenseNumber: '',
        serviceArea: '',
        experience: '',
      });
      setSpecializations([]);
      showToast(result.message, 'success');
    } else {
      console.error('Registration failed:', result.message);
      showToast(result.message || 'Please check your information and try again', 'error');
    }
  };

  const handleSubmit = () => {
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.desktopScrollContent
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>🔧 PlumberHub</Text>
            <Text style={styles.tagline}>
              {isLogin ? 'Welcome back!' : 'Create your account'}
            </Text>
          </View>

          {/* Main Card */}
          <View style={[styles.card, isDesktop && styles.desktopCard]}>
            {/* Tab Switcher */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>
                  Login
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, !isLogin && styles.tabActive]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>
                  Register
                </Text>
              </TouchableOpacity>
            </View>

            {/* User Type Selection (Register Only) */}
            {!isLogin && (
              <View style={styles.userTypeContainer}>
                <Text style={styles.sectionLabel}>I want to register as:</Text>
                <View style={styles.userTypeButtons}>
                  <TouchableOpacity
                    style={[
                      styles.userTypeCard,
                      userType === 'client' && styles.userTypeCardActive,
                    ]}
                    onPress={() => setUserType('client')}
                  >
                    <Text style={styles.userTypeIcon}>🏠</Text>
                    <Text style={styles.userTypeTitle}>Client</Text>
                    <Text style={styles.userTypeSubtitle}>I need plumbing services</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.userTypeCard,
                      userType === 'plumber' && styles.userTypeCardActive,
                    ]}
                    onPress={() => setUserType('plumber')}
                  >
                    <Text style={styles.userTypeIcon}>🔧</Text>
                    <Text style={styles.userTypeTitle}>Plumber</Text>
                    <Text style={styles.userTypeSubtitle}>I provide plumbing services</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Form Fields */}
            <View style={styles.form}>
              {!isLogin && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#999"
                    value={formData.name}
                    onChangeText={value => handleInputChange('name', value)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone (0XXXXXXXXX or +996XXXXXXXXX)"
                    placeholderTextColor="#999"
                    value={formData.phone}
                    onChangeText={value => handleInputChange('phone', value)}
                    keyboardType="phone-pad"
                  />
                </>
              )}

              <TextInput
                style={styles.input}
                placeholder="Email (example@gmail.com)"
                placeholderTextColor="#999"
                value={formData.email}
                onChangeText={value => handleInputChange('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={formData.password}
                onChangeText={value => handleInputChange('password', value)}
                secureTextEntry
              />

              {!isLogin && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm Password"
                    placeholderTextColor="#999"
                    value={formData.confirmPassword}
                    onChangeText={value => handleInputChange('confirmPassword', value)}
                    secureTextEntry
                  />
                </>
              )}

              {/* Plumber-specific fields removed - will be in profile settings */}

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? 'Loading...' : isLogin ? 'Login' : 'Create Account'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
                <Text style={styles.switchText}>
                  {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  desktopScrollContent: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.95,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
  desktopCard: {
    maxWidth: 600,
    width: '100%',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#667eea',
  },
  tabText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
  tabTextActive: {
    color: '#fff',
  },
  userTypeContainer: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  userTypeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  userTypeCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  userTypeCardActive: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  userTypeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  userTypeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userTypeSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
  },
  specializationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  specButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#f8f9fa',
  },
  specButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  specButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  specButtonTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchText: {
    color: '#667eea',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
  demoBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#667eea',
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 8,
  },
  demoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});