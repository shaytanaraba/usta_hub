import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import Button from '../components/shared/Button';
import auth from '../services/auth';
import orderService from '../services/orders';
import { timeAgo, getUrgencyColor, getUrgencyLabel, getStatusColor } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';

export default function PlumberDashboard({ navigation }) {
  const [user, setUser] = useState(null);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available');
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    activeJobs: 0,
    completedJobs: 0,
    totalEarnings: 0,
  });

  // Completion Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [completionForm, setCompletionForm] = useState({
    workflowDescription: '', // Typo fix: workDescription
    workDescription: '',
    hoursWorked: '',
    amountCharged: '',
  });

  const [filters, setFilters] = useState({
    serviceType: 'all',
    urgency: 'all',
  });
  const [searchQuery, setSearchQuery] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    loadUserData();
    loadData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);

    // Real-time subscription for new orders
    const subscription = supabase
      .channel('orders')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: 'status=eq.pending' },
        (payload) => {
          console.log('New order detected:', payload.new);
          showToast('New job available!', 'info');
          loadData(); // Refresh data
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Order updated:', payload.new);
          loadData(); // Refresh data
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserData = async () => {
    const currentUser = await auth.getCurrentUser();
    setUser(currentUser);
  };

  const loadData = async () => {
    const currentUser = await auth.getCurrentUser();
    if (currentUser) {
      const available = await orderService.getAvailableOrders();
      const myActive = await orderService.getPlumberOrders(currentUser.id);
      const plumberStats = await orderService.getPlumberStats(currentUser.id);

      setAvailableOrders(available);
      setMyOrders(myActive);
      setStats(plumberStats);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleClaimOrder = async (orderId) => {
    console.log('Claiming order:', orderId);

    const confirmClaim = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to claim this order?')
      : true; // For native, we could keep Alert.alert but let's make it consistent or just proceed

    if (!confirmClaim && Platform.OS === 'web') return;

    if (Platform.OS !== 'web') {
      Alert.alert(
        'Claim Order',
        'Are you sure you want to claim this order?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Claim',
            onPress: () => performClaim(orderId)
          }
        ]
      );
    } else {
      await performClaim(orderId);
    }
  };

  const performClaim = async (orderId) => {
    try {
      console.log('Performing claim for order:', orderId);
      const result = await orderService.claimOrder(orderId, user);
      console.log('Claim result:', result);

      if (result.success) {
        Alert.alert('Success', result.message);
        await loadData();
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('perfomClaim error:', error);
      Alert.alert('Error', 'An unexpected error occurred while claiming.');
    }
  };

  const handleStartJob = async (orderId) => {
    console.log('Starting job:', orderId);
    const result = await orderService.updateOrderStatus(orderId, 'in_progress');
    console.log('Start job result:', result);
    if (result.success) {
      if (Platform.OS === 'web') {
        showToast('Job started successfully', 'success');
      } else {
        showToast('Job started successfully', 'success');
      }
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleCompleteJob = (orderId) => {
    setSelectedOrderId(orderId);
    setCompletionForm({
      workDescription: '',
      hoursWorked: '',
      amountCharged: '',
    });
    setModalVisible(true);
  };

  const submitCompletionForm = async () => {
    if (!completionForm.workDescription.trim()) {
      showToast('Work description is required', 'error');
      return;
    }
    if (!completionForm.hoursWorked || isNaN(completionForm.hoursWorked)) {
      showToast('Please enter valid hours worked', 'error');
      return;
    }
    if (!completionForm.amountCharged || isNaN(completionForm.amountCharged)) {
      showToast('Please enter valid amount charged', 'error');
      return;
    }

    const completionData = {
      workDescription: completionForm.workDescription,
      hoursWorked: parseFloat(completionForm.hoursWorked),
      amountCharged: parseFloat(completionForm.amountCharged),
      paymentMethod: 'cash',
    };

    const result = await orderService.submitCompletion(selectedOrderId, completionData);
    if (result.success) {
      setModalVisible(false);
      showToast(result.message, 'success');
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleLogout = async () => {
    await auth.logoutUser();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const getFilteredOrders = (orders) => {
    let filtered = orders;

    // Filter by urgency
    if (filters.urgency !== 'all') {
      filtered = filtered.filter(order => order.urgency === filters.urgency);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.serviceDetails.problemDescription.toLowerCase().includes(query) ||
        order.serviceDetails.address.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const renderAvailableOrderCard = (order) => (
    <View
      key={order.id}
      style={[
        styles.orderCard,
        order.urgency === 'emergency' && styles.emergencyCard,
      ]}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>#{order.id}</Text>
        <View
          style={[
            styles.urgencyBadge,
            { backgroundColor: getUrgencyColor(order.urgency) },
          ]}
        >
          <Text style={styles.urgencyText}>{getUrgencyLabel(order.urgency)}</Text>
        </View>
      </View>
      <Text style={styles.serviceType}>{order.serviceDetails.serviceType.toUpperCase()}</Text>
      <Text style={styles.description}>{order.serviceDetails.problemDescription}</Text>
      <Text style={styles.address}>{order.serviceDetails.address}</Text>
      <Text style={styles.time}>{timeAgo(order.createdAt)}</Text>
      <TouchableOpacity
        style={[styles.claimButton, !user?.is_verified && { opacity: 0.5, backgroundColor: '#ccc' }]}
        onPress={() => handleClaimOrder(order.id)}
        disabled={!user?.is_verified}
      >
        <Text style={styles.claimButtonText}>
          {user?.is_verified ? 'CLAIM ORDER' : 'VERIFICATION REQUIRED'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderMyOrderCard = (order) => (
    <View key={order.id} style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>#{order.id}</Text>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}
        >
          <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.serviceType}>{order.serviceDetails.serviceType.toUpperCase()}</Text>

      <View style={styles.clientInfo}>
        <Text style={styles.clientLabel}>Client:</Text>
        <Text style={styles.clientName}>{order.clientName}</Text>
        <Text style={styles.clientPhone}>{order.clientPhone}</Text>
        <Text style={styles.clientEmail}>{order.clientEmail}</Text>
      </View>

      <Text style={styles.description}>{order.serviceDetails.problemDescription}</Text>
      <Text style={styles.address}>{order.serviceDetails.address}</Text>

      <View style={styles.actionButtons}>
        {order.status === 'claimed' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleStartJob(order.id)}
          >
            <Text style={styles.actionButtonText}>Start Job</Text>
          </TouchableOpacity>
        )}
        {(order.status === 'claimed' || order.status === 'in_progress') && (
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
            onPress={() => handleCompleteJob(order.id)}
          >
            <Text style={styles.actionButtonText}>Complete Job</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome,</Text>
          <Text style={styles.headerTitle}>Plumber Dashboard</Text>
          {user && (
            <View style={[
              styles.headerBadge,
              user.is_verified ? styles.headerBadgeVerified : styles.headerBadgeUnverified
            ]}>
              <Text style={styles.headerBadgeText}>
                {user.is_verified ? '✓ Verified' : '⚠ Unverified'}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.activeJobs}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.completedJobs}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>${stats.totalEarnings.toFixed(0)}</Text>
          <Text style={styles.statLabel}>Earnings</Text>
        </View>
      </View>

      {/* Verification Status Banners */}
      {user && !user.is_verified && (
        <View style={styles.incompleteBanner}>
          <Text style={styles.incompleteBannerText}>
            {(!user.service_area || !user.experience)
              ? '⚠️ Complete your profile to get verified!'
              : '🕒 Your account is pending verification.'}
          </Text>
          <TouchableOpacity
            style={styles.completeProfileButton}
            onPress={() => navigation.navigate('PlumberProfileSettings')}
          >
            <Text style={styles.completeProfileButtonText}>
              {(!user.service_area || !user.experience) ? 'Complete Profile' : 'Check Status'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'available' && styles.tabActive]}
          onPress={() => setActiveTab('available')}
        >
          <Text style={[styles.tabText, activeTab === 'available' && styles.tabTextActive]}>
            Available ({getFilteredOrders(availableOrders).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'myOrders' && styles.tabActive]}
          onPress={() => setActiveTab('myOrders')}
        >
          <Text style={[styles.tabText, activeTab === 'myOrders' && styles.tabTextActive]}>
            My Jobs ({myOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters for Available Orders */}
      {activeTab === 'available' && (
        <View style={styles.filtersContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by address or description..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterButton, filters.urgency === 'all' && styles.filterButtonActive]}
              onPress={() => setFilters({ ...filters, urgency: 'all' })}
            >
              <Text style={[styles.filterButtonText, filters.urgency === 'all' && styles.filterButtonTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, filters.urgency === 'emergency' && styles.filterButtonActive]}
              onPress={() => setFilters({ ...filters, urgency: 'emergency' })}
            >
              <Text style={[styles.filterButtonText, filters.urgency === 'emergency' && styles.filterButtonTextActive]}>Emergency</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, filters.urgency === 'urgent' && styles.filterButtonActive]}
              onPress={() => setFilters({ ...filters, urgency: 'urgent' })}
            >
              <Text style={[styles.filterButtonText, filters.urgency === 'urgent' && styles.filterButtonTextActive]}>Urgent</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'available' ? (
          getFilteredOrders(availableOrders).length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No available orders</Text>
              <Text style={styles.emptySubtext}>Check back later for new opportunities</Text>
            </View>
          ) : (
            getFilteredOrders(availableOrders).map(renderAvailableOrderCard)
          )
        ) : (
          myOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No jobs yet</Text>
              <Text style={styles.emptySubtext}>Claim orders from the available tab</Text>
            </View>
          ) : (
            myOrders.map(renderMyOrderCard)
          )
        )}
      </ScrollView>
      {/* Completion Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Job</Text>

            <Text style={styles.label}>Work Description</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Describe what you did..."
              multiline
              numberOfLines={3}
              value={completionForm.workDescription}
              onChangeText={(text) => setCompletionForm({ ...completionForm, workDescription: text })}
            />

            <Text style={styles.label}>Hours Worked</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2.5"
              keyboardType="numeric"
              value={completionForm.hoursWorked}
              onChangeText={(text) => setCompletionForm({ ...completionForm, hoursWorked: text })}
            />

            <Text style={styles.label}>Amount Charged ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 150.00"
              keyboardType="numeric"
              value={completionForm.amountCharged}
              onChangeText={(text) => setCompletionForm({ ...completionForm, amountCharged: text })}
            />

            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                title="Submit"
                onPress={submitCompletionForm}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007bff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userTypeText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statsBar: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#dee2e6',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007bff',
  },
  tabText: {
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#007bff',
  },
  content: {
    flex: 1,
    padding: 15,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emergencyCard: {
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  headerBadgeVerified: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#fff',
  },
  headerBadgeUnverified: {
    backgroundColor: '#ffc107',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  logoutButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fff',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgencyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  serviceType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  address: {
    fontSize: 13,
    color: '#666',
    marginBottom: 5,
  },
  time: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  clientInfo: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  clientLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  clientPhone: {
    fontSize: 13,
    color: '#007bff',
    marginBottom: 2,
  },
  clientEmail: {
    fontSize: 12,
    color: '#666',
  },
  claimButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007bff',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  completeButton: {
    backgroundColor: '#28a745',
    marginRight: 0,
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 10,
  },
  incompleteBanner: {
    backgroundColor: '#fff3cd',
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incompleteBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    fontWeight: '500',
  },
  completeProfileButton: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  completeProfileButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  filtersContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
});