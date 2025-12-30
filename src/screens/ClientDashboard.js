import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import auth from '../services/auth';
import orderService from '../services/orders';
import { formatDateTime, formatCurrency, timeAgo, getStatusColor } from '../utils/helpers';
import { useResponsive } from '../utils/responsive';
import Card from '../components/shared/Card';
import Button from '../components/shared/Button';
import { useToast } from '../contexts/ToastContext';

export default function ClientDashboard({ navigation }) {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('orders');
  const [refreshing, setRefreshing] = useState(false);

  // Form State
  const [newOrder, setNewOrder] = useState({
    serviceType: 'repair',
    problemDescription: '',
    address: '',
    urgency: 'planned',
    preferredDate: '',
    preferredTime: '',
    photos: []
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });

  const { isDesktop } = useResponsive();
  const { showToast } = useToast();

  useEffect(() => {
    loadUserData();
    loadOrders();
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    setNewOrder(prev => ({ ...prev, preferredDate: tmr.toISOString().split('T')[0] }));
  }, []);

  const loadUserData = async () => {
    const currentUser = await auth.getCurrentUser();
    setUser(currentUser);
    if (currentUser) {
      setProfileForm({
        name: currentUser.full_name || currentUser.name || '',
        phone: currentUser.phone || ''
      });
    }
  };

  const loadOrders = async () => {
    const currentUser = await auth.getCurrentUser();
    if (currentUser) {
      const clientOrders = await orderService.getClientOrders(currentUser.id);
      setOrders(clientOrders);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }, []);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
      });

      if (!result.canceled) {
        setNewOrder(prev => ({
          ...prev,
          photos: [...prev.photos, result.assets[0].uri]
        }));
      }
    } catch (e) {
      showToast('Error picking image', 'error');
    }
  };

  const removePhoto = (index) => {
    setNewOrder(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleSubmitOrder = async () => {
    if (!newOrder.problemDescription.trim()) {
      showToast('Please describe the problem', 'error');
      return;
    }
    if (!newOrder.address.trim()) {
      showToast('Please provide the service address', 'error');
      return;
    }

    if (newOrder.urgency === 'planned') {
      if (!newOrder.preferredDate) {
        showToast('Date is mandatory for planned services', 'error');
        return;
      }
      if (!newOrder.preferredTime) {
        showToast('Time is mandatory for planned services', 'error');
        return;
      }
    }

    const orderToSubmit = {
      ...newOrder,
      preferredDate: newOrder.urgency === 'urgent' ? null : newOrder.preferredDate,
      preferredTime: newOrder.urgency === 'urgent' ? null : newOrder.preferredTime,
    };

    const result = await orderService.submitOrder(orderToSubmit, user);

    if (result.success) {
      showToast(result.message, 'success');
      setNewOrder({
        serviceType: 'repair',
        problemDescription: '',
        address: '',
        urgency: 'planned',
        preferredDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        preferredTime: '',
        photos: []
      });
      setActiveTab('orders');
      await loadOrders();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    const result = await auth.updateProfile(user.id, {
      name: profileForm.name,
      phone: profileForm.phone
    });

    if (result.success) {
      showToast('Profile updated successfully', 'success');
      loadUserData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleLogout = async () => {
    await auth.logoutUser();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handleConfirmPayment = async (order) => {
    console.log('--- BUTTON CLICKED ---', order.id);
    if (Platform.OS === 'web') {
      // Direct alert to see if this is even reached
      const confirmMsg = `Pay ${formatCurrency(order.completion.amountCharged)}?`;
      if (window.confirm(confirmMsg)) {
        console.log('--- WEB CONFIRMED ---');
        const result = await orderService.confirmCompletion(order.id, order.completion.amountCharged, 'cash');
        if (result.success) {
          showToast('Payment confirmed!', 'success');
          loadOrders();
        } else {
          showToast(result.message || 'Error updating', 'error');
        }
      }
    } else {
      Alert.alert(
        'Confirm Payment',
        `Pay ${formatCurrency(order.completion.amountCharged)}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm', onPress: async () => {
              const result = await orderService.confirmCompletion(order.id, order.completion.amountCharged, 'cash');
              if (result.success) {
                showToast('Payment confirmed!', 'success');
                loadOrders();
              }
            }
          }
        ]
      );
    }
  };

  const renderOrderCard = (order) => (
    <Card key={order.id} style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
          <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.orderServiceType}>{order.serviceDetails.serviceType.toUpperCase()}</Text>
        <Text style={styles.urgencyText}>
          {order.urgency === 'urgent' || order.urgency === 'emergency' ? '🚨 URGENT' : order.serviceDetails.preferredDate || 'Planned'}
        </Text>
      </View>

      <Text style={styles.orderDescription}>{order.serviceDetails.problemDescription}</Text>
      <Text style={styles.orderAddress}>📍 {order.serviceDetails.address}</Text>

      {order.assignedPlumber && (
        <View style={styles.plumberInfo}>
          <Text style={styles.plumberName}>👨‍🔧 {order.assignedPlumber.plumberName}</Text>
        </View>
      )}

      {order.completion && !order.completion.clientConfirmed && (
        <View style={styles.completionSection}>
          <Text style={styles.completionAmount}>Charge: {formatCurrency(order.completion.amountCharged)}</Text>
          <TouchableOpacity
            style={[styles.payBtn, { zIndex: 9999 }]}
            onPress={() => handleConfirmPayment(order)}
            activeOpacity={0.6}
          >
            <Text style={styles.payBtnText}>Confirm & Pay Now</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );

  const renderNewOrderForm = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.label}>Urgency Level</Text>
      <View style={styles.optionsContainer}>
        {['planned', 'urgent'].map(urg => (
          <TouchableOpacity
            key={urg}
            style={[styles.optionButton, newOrder.urgency === urg && styles.optionButtonActive]}
            onPress={() => setNewOrder({ ...newOrder, urgency: urg })}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, newOrder.urgency === urg && styles.optionTextActive]}>
              {urg === 'urgent' ? '⚡ Urgent (ASAP)' : '📅 Planned'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Service Type</Text>
      <View style={styles.optionsContainer}>
        {['repair', 'installation', 'inspection'].map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.optionButton, newOrder.serviceType === type && styles.optionButtonActive]}
            onPress={() => setNewOrder({ ...newOrder, serviceType: type })}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionText, newOrder.serviceType === type && styles.optionTextActive]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {newOrder.urgency === 'planned' && (
        <View style={styles.dateTimeContainer}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.label}>Date *</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.webInputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={newOrder.preferredDate}
                  onChangeText={t => setNewOrder({ ...newOrder, preferredDate: t })}
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
                <Text>{newOrder.preferredDate || 'Select Date'}</Text>
                <Ionicons name="calendar" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Time *</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.webInputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="HH:MM"
                  value={newOrder.preferredTime}
                  onChangeText={t => setNewOrder({ ...newOrder, preferredTime: t })}
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
                <Text>{newOrder.preferredTime || 'Select Time'}</Text>
                <Ionicons name="time" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={newOrder.preferredDate ? new Date(newOrder.preferredDate) : new Date()}
          mode="date"
          minimumDate={new Date()}
          onChange={(e, d) => {
            setShowDatePicker(false);
            if (d) setNewOrder({ ...newOrder, preferredDate: d.toISOString().split('T')[0] });
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={new Date()}
          mode="time"
          onChange={(e, d) => {
            setShowTimePicker(false);
            if (d) setNewOrder({ ...newOrder, preferredTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
          }}
        />
      )}

      <Text style={styles.label}>Description *</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Describe the issue..."
        multiline
        value={newOrder.problemDescription}
        onChangeText={t => setNewOrder({ ...newOrder, problemDescription: t })}
      />

      <Text style={styles.label}>Address *</Text>
      <TextInput
        style={styles.input}
        placeholder="123 Main St..."
        value={newOrder.address}
        onChangeText={t => setNewOrder({ ...newOrder, address: t })}
      />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoContainer}>
        {newOrder.photos.map((uri, idx) => (
          <View key={idx} style={styles.photoWrapper}>
            <Image source={{ uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(idx)}>
              <Ionicons name="close-circle" size={20} color="red" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickImage}>
          <Ionicons name="camera" size={24} color="#666" />
          <Text style={styles.addPhotoText}>Add</Text>
        </TouchableOpacity>
      </View>

      <Button title="Submit Order" onPress={handleSubmitOrder} style={styles.submitButton} />
    </ScrollView>
  );

  const renderProfileTab = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.sectionTitle}>My Profile</Text>
      <Text style={styles.label}>Email (Read-only)</Text>
      <TextInput style={[styles.input, { backgroundColor: '#eee' }]} value={user?.email} editable={false} />
      <Text style={styles.label}>Full Name</Text>
      <TextInput style={styles.input} value={profileForm.name} onChangeText={t => setProfileForm({ ...profileForm, name: t })} />
      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={profileForm.phone} onChangeText={t => setProfileForm({ ...profileForm, phone: t })} keyboardType="phone-pad" />
      <Button title="Update Profile" onPress={handleUpdateProfile} style={{ marginTop: 20 }} />
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
          <Text style={styles.userTypeText}>Client Dashboard</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtnTop} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.tabBar}>
        {['orders', 'new', 'profile'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'new' ? '➕ New Order' : tab === 'profile' ? '👤 Profile' : '📋 Orders'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'orders' && (
          orders.length === 0 ? (
            <View style={styles.emptyContainer}><Text>No orders yet.</Text></View>
          ) : (
            <ScrollView>
              {orders.map(renderOrderCard)}
            </ScrollView>
          )
        )}
        {activeTab === 'new' && renderNewOrderForm()}
        {activeTab === 'profile' && renderProfileTab()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  welcomeText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  userTypeText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500', marginTop: 2 },
  logoutBtnTop: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  logoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginTop: -20, borderRadius: 15, padding: 5, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#667eea' },
  tabText: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: '#fff' },
  content: { flex: 1, padding: 15, paddingTop: 30 },
  formContainer: { flex: 1 },
  label: { fontWeight: '700', color: '#475569', marginTop: 20, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16, color: '#1e293b' },
  textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16, height: 100, textAlignVertical: 'top', color: '#1e293b' },
  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  optionButtonActive: { backgroundColor: '#667eea', borderColor: '#667eea' },
  optionText: { color: '#64748b', fontWeight: '600' },
  optionTextActive: { color: '#fff' },
  dateTimeContainer: { flexDirection: 'row' },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12 },
  submitButton: { marginTop: 30, marginBottom: 50, borderRadius: 12 },
  photoContainer: { flexDirection: 'row', gap: 12, marginTop: 5 },
  photoWrapper: { position: 'relative' },
  photoThumb: { width: 70, height: 70, borderRadius: 12 },
  removePhoto: { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 12, elevation: 2 },
  addPhotoBtn: { width: 70, height: 70, borderRadius: 12, borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  addPhotoText: { fontSize: 10, color: '#64748b', fontWeight: '600', marginTop: 2 },
  orderCard: { padding: 20, marginBottom: 20, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#64748b', shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  orderId: { fontWeight: '800', color: '#94a3b8', fontSize: 12, letterSpacing: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  orderServiceType: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  urgencyText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  orderDescription: { marginVertical: 12, color: '#475569', fontSize: 15, lineHeight: 22 },
  orderAddress: { fontSize: 13, color: '#64748b', marginBottom: 15, fontWeight: '500' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 24, fontWeight: '800', marginBottom: 25, color: '#1e293b' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  plumberInfo: { marginTop: 15, padding: 15, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  plumberName: { fontWeight: '700', color: '#4338ca', fontSize: 14 },
  completionSection: { marginTop: 20, padding: 15, backgroundColor: '#f0fdf4', borderRadius: 15, borderWidth: 1, borderColor: '#dcfce7' },
  completionAmount: { fontWeight: '800', color: '#166534', fontSize: 18, marginBottom: 10 },
  payBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 10,
    ...Platform.select({
      web: { cursor: 'pointer' }
    })
  },
  payBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  }
});