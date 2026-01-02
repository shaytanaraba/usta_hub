import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
  TextInput,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import auth from '../services/auth';
import orderService from '../services/orders';
import settingsService from '../services/settings';
import { formatCurrency, formatDateTime, getStatusColor } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';
import { checkVerificationRequirements } from '../config/verificationRequirements';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, BarChart } from '../components/shared/Charts';

const { width } = Dimensions.get('window');

export default function AdminDashboard({ navigation }) {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Data State
  const [stats, setStats] = useState({});
  const [orders, setOrders] = useState([]);
  const [plumbers, setPlumbers] = useState([]);
  const [plumberStats, setPlumberStats] = useState({}); // Calculated locally
  const [settings, setSettings] = useState({ commissionRate: 0.15 });

  // UI State
  const [refreshing, setRefreshing] = useState(false);
  const [plumberSearch, setPlumberSearch] = useState('');

  // Modal State
  const [selectedPlumber, setSelectedPlumber] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [plumberOrders, setPlumberOrders] = useState([]);

  // Settings UI State
  const [newCommissionRate, setNewCommissionRate] = useState('15');

  // Clients State
  const [clients, setClients] = useState([]);
  const [clientStats, setClientStats] = useState({});

  // Filters State
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [plumberVerificationFilter, setPlumberVerificationFilter] = useState('all');
  const [clientSearch, setClientSearch] = useState('');

  // CRUD Modals
  const [editClientModal, setEditClientModal] = useState(false);
  const [editOrderModal, setEditOrderModal] = useState(false);
  const [editPlumberModal, setEditPlumberModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Interactive Stats Modal
  const [statsModal, setStatsModal] = useState(false);
  const [statsModalData, setStatsModalData] = useState({ title: '', data: [] });
  const [commissionPeriod, setCommissionPeriod] = useState('all');
  const [revenueData, setRevenueData] = useState({});

  // Chart Data
  const [orderDistribution, setOrderDistribution] = useState({});

  // Disputes State
  const [disputes, setDisputes] = useState([]);
  const [selectedDispute, setSelectedDispute] = useState(null);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    loadUserData();
    loadData();
  }, []);

  const loadUserData = async () => {
    const currentUser = await auth.getCurrentUser();
    setUser(currentUser);
  };

  const loadData = async () => {
    try {
      const [
        platformStats,
        allOrders,
        allPlumbers,
        platformSettings,
        allDisputes,
        allClients,
        distribution,
      ] = await Promise.all([
        orderService.getPlatformStats(),
        orderService.getAllOrders(),
        auth.getAllPlumbers(),
        settingsService.getSettings(),
        orderService.getAllDisputes(),
        auth.getAllClients(),
        orderService.getOrderStatusDistribution(),
      ]);

      setStats(platformStats);
      setOrders(allOrders);
      setPlumbers(allPlumbers);
      setSettings(platformSettings);
      setNewCommissionRate((platformSettings.commissionRate * 100).toString());
      setDisputes(allDisputes);
      setClients(allClients);
      setOrderDistribution(distribution);

      // Pre-calculate plumber stats from orders locally to avoid N+1 queries
      const pStats = {};
      allPlumbers.forEach(p => {
        const pOrders = allOrders.filter(o => o.assignedPlumber?.plumberId === p.id);
        const completed = pOrders.filter(o => o.status === 'verified').length;
        const earnings = pOrders
          .filter(o => o.status === 'verified')
          .reduce((sum, o) => sum + (Number(o.completion?.amountCharged) || 0), 0);

        pStats[p.id] = { completed, earnings };
      });
      setPlumberStats(pStats);

      // Pre-calculate client stats
      const cStats = {};
      for (const client of allClients) {
        const stats = await auth.getClientStats(client.id);
        cStats[client.id] = stats;
      }
      setClientStats(cStats);

    } catch (e) {
      console.error(e);
      showToast('Error loading data', 'error');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    await auth.logoutUser();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handleVerifyPlumber = async (plumberId, isCurrentlyVerified) => {
    if (isCurrentlyVerified) {
      // Unverify logic
      const confirmUnverify = Platform.OS === 'web'
        ? window.confirm('Unverify this plumber? They will stop receiving orders.')
        : await new Promise(r => Alert.alert('Confirm Unverify', 'Unverify this plumber?', [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Unverify', onPress: () => r(true) }]));

      if (!confirmUnverify) return;

      const result = await auth.unverifyPlumber(plumberId);
      if (result.success) {
        showToast('Plumber unverified', 'success');
        loadData();
      } else {
        showToast(result.message, 'error');
      }
      return;
    }

    // Verify logic
    const plumber = plumbers.find(p => p.id === plumberId);
    if (!plumber) return;

    const check = checkVerificationRequirements(plumber);
    if (!check.canVerify) {
      Alert.alert('Cannot Verify', `Missing:\n• ${check.missing.join('\n• ')}`);
      return;
    }

    const confirmVerify = Platform.OS === 'web'
      ? window.confirm('Verify this plumber?')
      : await new Promise(r => Alert.alert('Confirm', 'Verify this plumber?', [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Verified', onPress: () => r(true) }]));

    if (!confirmVerify) return;

    const result = await auth.verifyPlumber(plumberId);
    if (result.success) {
      showToast('Verified successfully', 'success');
      loadData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const openPlumberDetails = (plumber) => {
    const pOrders = orders.filter(o => o.assignedPlumber?.plumberId === plumber.id);
    setPlumberOrders(pOrders);
    setSelectedPlumber(plumber);
    setModalVisible(true);
  };

  const saveCommission = async () => {
    const rate = parseFloat(newCommissionRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) {
      Alert.alert('Invalid Rate', 'Please enter a percentage between 0 and 100');
      return;
    }

    const result = await settingsService.updateSettings({ commissionRate: rate });
    if (result.success) {
      showToast('Commission rate updated', 'success');
      loadData();
    } else {
      showToast('Failed to update', 'error');
    }
  };

  const openDisputeDetails = (dispute) => {
    setSelectedDispute(dispute);
    setAdminNotes(dispute.admin_notes || '');
    setDisputeModalVisible(true);
  };

  const handleUpdateDisputeStatus = async (status) => {
    if (!selectedDispute) return;

    const result = await orderService.updateDispute(
      selectedDispute.id,
      { status, adminNotes },
      user.id
    );

    if (result.success) {
      showToast(`Dispute ${status}`, 'success');
      setDisputeModalVisible(false);
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleCloseDispute = async () => {
    if (!selectedDispute) return;

    const result = await orderService.closeDispute(selectedDispute.id, user.id, true);

    if (result.success) {
      showToast('Dispute closed', 'success');
      setDisputeModalVisible(false);
      await loadData();
    } else {
      showToast(result.message, 'error');
    }
  };

  const renderDashboardTab = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Platform Statistics</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="list" size={24} color="#4338ca" style={{ marginBottom: 10 }} />
          <Text style={styles.statValue}>{stats.totalOrders || 0}</Text>
          <Text style={styles.statLabel}>Total Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="hammer" size={24} color="#10b981" style={{ marginBottom: 10 }} />
          <Text style={styles.statValue}>{stats.activeJobs || 0}</Text>
          <Text style={styles.statLabel}>Active Jobs</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
          <Ionicons name="cash" size={24} color="#3b82f6" style={{ marginBottom: 10 }} />
          <Text style={styles.statValue}>{formatCurrency(stats.totalRevenue || 0)}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}>
          <Ionicons name="briefcase" size={24} color="#f59e0b" style={{ marginBottom: 10 }} />
          <Text style={styles.statValue}>{formatCurrency(stats.totalCommission || 0)}</Text>
          <Text style={styles.statLabel}>Commission</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderOrdersTab = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>All Orders</Text>
      {orders.map((order) => (
        <View key={order.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: getStatusColor(order.status) }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>#{order.id.slice(0, 8)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
              <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.cardText}><Text style={{ fontWeight: '700' }}>Client:</Text> {order.clientName}</Text>
          <Text style={styles.cardText}><Text style={{ fontWeight: '700' }}>Type:</Text> {order.serviceDetails.serviceType}</Text>
          <Text style={styles.cardText}><Text style={{ fontWeight: '700' }}>Plumber:</Text> {order.assignedPlumber?.plumberName || 'Unassigned'}</Text>
          <Text style={styles.smDate}>{formatDateTime(order.createdAt)}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderPlumbersTab = () => {
    const filtered = plumbers.filter(p =>
      p.name?.toLowerCase().includes(plumberSearch.toLowerCase()) ||
      p.email?.toLowerCase().includes(plumberSearch.toLowerCase())
    );

    return (
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Plumber Management</Text>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            value={plumberSearch}
            onChangeText={setPlumberSearch}
          />
        </View>

        {/* Table View */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.tableContainer}>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.cell, styles.headerCell, { width: 150 }]}>Name</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 120 }]}>Phone</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 100 }]}>Status</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 80 }]}>Rating</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 100 }]}>Jobs</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 100 }]}>Earnings</Text>
              <Text style={[styles.cell, styles.headerCell, { width: 120 }]}>Actions</Text>
            </View>

            {/* Table Body */}
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              scrollEnabled={false} // Let parent ScrollView handle vertical
              renderItem={({ item }) => {
                const pStat = plumberStats[item.id] || { completed: 0, earnings: 0 };
                return (
                  <View style={styles.tableRow}>
                    <Text style={[styles.cell, { width: 150 }]}>{item.name}</Text>
                    <Text style={[styles.cell, { width: 120 }]}>{item.phone || 'N/A'}</Text>
                    <View style={{ width: 100, paddingRight: 10 }}>
                      <View style={[
                        styles.miniBadge,
                        item.is_verified ? styles.verifiedBadgeYes : styles.verifiedBadgeNo
                      ]}>
                        <Text style={styles.miniBadgeText}>{item.is_verified ? 'Verif.' : 'Pend.'}</Text>
                      </View>
                    </View>
                    <Text style={[styles.cell, { width: 80 }]}>⭐ {item.plumberProfile?.rating || 0}</Text>
                    <Text style={[styles.cell, { width: 100 }]}>{pStat.completed}</Text>
                    <Text style={[styles.cell, { width: 100, color: 'green' }]}>{formatCurrency(pStat.earnings)}</Text>

                    <View style={[styles.cell, { width: 120, flexDirection: 'row', gap: 5 }]}>
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: '#17a2b8' }]}
                        onPress={() => openPlumberDetails(item)}
                      >
                        <Ionicons name="eye" size={16} color="#fff" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: item.is_verified ? '#6c757d' : '#28a745' }]}
                        onPress={() => handleVerifyPlumber(item.id, item.is_verified)}
                      >
                        <Ionicons name={item.is_verified ? "close" : "checkmark"} size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderSettingsTab = () => (
    <ScrollView style={styles.content}>
      <Text style={styles.sectionTitle}>Platform Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Commission Settings</Text>
        <Text style={styles.helpText}>Set the platform commission rate (%) applied to job completion.</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Commission Rate (%)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={newCommissionRate}
            onChangeText={setNewCommissionRate}
            placeholder="15"
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveCommission}>
          <Text style={styles.saveBtnText}>Update Commission</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Default Support Info</Text>
        <Text style={styles.cardText}>Support Email: {settings.supportEmail || 'Not Set'}</Text>
        <Text style={styles.cardText}>Support Phone: {settings.supportPhone || 'Not Set'}</Text>
      </View>
    </ScrollView>
  );

  const renderComplianceTab = () => {
    const openDisputes = disputes.filter(d => d.status === 'open' || d.status === 'in_review');
    const resolvedDisputes = disputes.filter(d => d.status === 'resolved' || d.status === 'closed');

    return (
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Compliance & Disputes</Text>

        <View style={styles.disputeStats}>
          <View style={styles.disputeStatCard}>
            <Text style={styles.disputeStatValue}>{openDisputes.length}</Text>
            <Text style={styles.disputeStatLabel}>Open Cases</Text>
          </View>
          <View style={styles.disputeStatCard}>
            <Text style={styles.disputeStatValue}>{resolvedDisputes.length}</Text>
            <Text style={styles.disputeStatLabel}>Resolved</Text>
          </View>
        </View>

        <Text style={styles.subSectionTitle}>🔴 Open Disputes</Text>
        {openDisputes.length === 0 ? (
          <Text style={styles.emptyText}>No open disputes</Text>
        ) : (
          openDisputes.map(dispute => (
            <View key={dispute.id} style={[styles.card, styles.disputeCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Dispute #{dispute.id.slice(0, 8)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: '#f59e0b' }]}>
                  <Text style={styles.statusText}>{dispute.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.disputeInfo}>
                <Text style={styles.disputeLabel}>Order:</Text>
                <Text style={styles.disputeValue}>#{dispute.order?.id.slice(0, 8)}</Text>
              </View>

              <View style={styles.disputeInfo}>
                <Text style={styles.disputeLabel}>Client:</Text>
                <Text style={styles.disputeValue}>{dispute.client?.full_name} ({dispute.client?.phone})</Text>
              </View>

              <View style={styles.disputeInfo}>
                <Text style={styles.disputeLabel}>Plumber:</Text>
                <Text style={styles.disputeValue}>{dispute.plumber?.full_name} ({dispute.plumber?.phone})</Text>
              </View>

              <View style={styles.disputeInfo}>
                <Text style={styles.disputeLabel}>Amount:</Text>
                <Text style={styles.disputeValue}>{formatCurrency(dispute.order?.final_price || 0)}</Text>
              </View>

              <View style={styles.disputeReasonBox}>
                <Text style={styles.disputeReasonLabel}>Client's Reason:</Text>
                <Text style={styles.disputeReasonText}>{dispute.reason}</Text>
              </View>

              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => openDisputeDetails(dispute)}
              >
                <Text style={styles.reviewBtnText}>Review & Resolve</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={[styles.subSectionTitle, { marginTop: 30 }]}>✅ Resolved Disputes</Text>
        {resolvedDisputes.length === 0 ? (
          <Text style={styles.emptyText}>No resolved disputes</Text>
        ) : (
          resolvedDisputes.slice(0, 5).map(dispute => (
            <View key={dispute.id} style={[styles.card, styles.resolvedDisputeCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>#{dispute.id.slice(0, 8)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.statusText}>{dispute.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.cardText}>Order: #{dispute.order?.id.slice(0, 8)}</Text>
              <Text style={styles.cardText}>Resolved: {formatDateTime(dispute.resolved_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Admin: {user?.name}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {['dashboard', 'orders', 'plumbers', 'compliance', 'settings'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {refreshing ? (
          <View style={{ padding: 20 }}><Text>Refreshing...</Text></View>
        ) : (
          <>
            {activeTab === 'dashboard' && renderDashboardTab()}
            {activeTab === 'orders' && renderOrdersTab()}
            {activeTab === 'plumbers' && renderPlumbersTab()}
            {activeTab === 'compliance' && renderComplianceTab()}
            {activeTab === 'settings' && renderSettingsTab()}
          </>
        )}
      </View>

      {/* Plumber Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Plumber Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedPlumber && (
              <ScrollView style={{ marginTop: 10 }}>
                {/* Personal Data */}
                <View style={styles.infoSection}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <Text style={styles.infoVal}>{selectedPlumber.name}</Text>

                  <Text style={styles.infoLabel}>Email:</Text>
                  <Text style={styles.infoVal}>{selectedPlumber.email}</Text>

                  <Text style={styles.infoLabel}>Phone:</Text>
                  <Text style={styles.infoVal}>{selectedPlumber.phone || '-'}</Text>

                  <Text style={styles.infoLabel}>License:</Text>
                  <Text style={styles.infoVal}>{selectedPlumber.plumberProfile?.licenseNumber || '-'}</Text>

                  <Text style={styles.infoLabel}>Service Area:</Text>
                  <Text style={styles.infoVal}>{selectedPlumber.service_area || '-'}</Text>

                  <Text style={styles.infoLabel}>Specializations:</Text>
                  <Text style={styles.infoVal}>{(selectedPlumber.plumberProfile?.specializations || []).join(', ')}</Text>
                </View>

                <Text style={styles.subHeader}>Order History</Text>
                {plumberOrders.length === 0 ? (
                  <Text style={{ fontStyle: 'italic', color: '#666' }}>No orders found.</Text>
                ) : (
                  plumberOrders.map(o => (
                    <View key={o.id} style={styles.miniCard}>
                      <Text style={{ fontWeight: 'bold' }}>#{o.id.slice(0, 6)} - {o.status.toUpperCase()}</Text>
                      <Text>{o.serviceDetails.serviceType}</Text>
                      <Text style={{ fontSize: 12, color: '#666' }}>{formatDateTime(o.createdAt)}</Text>
                      <Text style={{ color: 'green' }}>{o.completion?.amountCharged ? formatCurrency(o.completion.amountCharged) : '-'}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dispute Details Modal */}
      <Modal
        visible={disputeModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDisputeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dispute Resolution</Text>
              <TouchableOpacity onPress={() => setDisputeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedDispute && (
              <ScrollView style={{ marginTop: 10 }}>
                <View style={styles.infoSection}>
                  <Text style={styles.infoLabel}>Dispute ID:</Text>
                  <Text style={styles.infoVal}>#{selectedDispute.id.slice(0, 8)}</Text>

                  <Text style={styles.infoLabel}>Order ID:</Text>
                  <Text style={styles.infoVal}>#{selectedDispute.order?.id.slice(0, 8)}</Text>

                  <Text style={styles.infoLabel}>Status:</Text>
                  <Text style={styles.infoVal}>{selectedDispute.status.toUpperCase()}</Text>

                  <Text style={styles.infoLabel}>Amount in Dispute:</Text>
                  <Text style={styles.infoVal}>{formatCurrency(selectedDispute.order?.final_price || 0)}</Text>

                  <Text style={styles.infoLabel}>Created:</Text>
                  <Text style={styles.infoVal}>{formatDateTime(selectedDispute.created_at)}</Text>
                </View>

                <View style={styles.contactSection}>
                  <Text style={styles.subHeader}>Contact Information</Text>
                  <View style={styles.contactCard}>
                    <Text style={styles.contactRole}>👤 Client</Text>
                    <Text style={styles.contactName}>{selectedDispute.client?.full_name}</Text>
                    <Text style={styles.contactDetail}>📧 {selectedDispute.client?.email}</Text>
                    <Text style={styles.contactDetail}>📞 {selectedDispute.client?.phone}</Text>
                  </View>

                  <View style={styles.contactCard}>
                    <Text style={styles.contactRole}>🔧 Plumber</Text>
                    <Text style={styles.contactName}>{selectedDispute.plumber?.full_name}</Text>
                    <Text style={styles.contactDetail}>📧 {selectedDispute.plumber?.email}</Text>
                    <Text style={styles.contactDetail}>📞 {selectedDispute.plumber?.phone}</Text>
                  </View>
                </View>

                <View style={styles.reasonSection}>
                  <Text style={styles.subHeader}>Client's Complaint</Text>
                  <Text style={styles.reasonText}>{selectedDispute.reason}</Text>
                </View>

                <View style={styles.notesSection}>
                  <Text style={styles.subHeader}>Admin Notes</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Add resolution notes (call summary, decision, etc.)..."
                    multiline
                    numberOfLines={4}
                    value={adminNotes}
                    onChangeText={setAdminNotes}
                  />
                </View>

                <View style={styles.actionButtons}>
                  {selectedDispute.status === 'open' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.inReviewBtn]}
                      onPress={() => handleUpdateDisputeStatus('in_review')}
                    >
                      <Text style={styles.actionButtonText}>Mark In Review</Text>
                    </TouchableOpacity>
                  )}

                  {(selectedDispute.status === 'open' || selectedDispute.status === 'in_review') && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.resolveBtn]}
                      onPress={() => handleUpdateDisputeStatus('resolved')}
                    >
                      <Text style={styles.actionButtonText}>Mark Resolved</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionButton, styles.closeDisputeBtn]}
                    onPress={handleCloseDispute}
                  >
                    <Text style={styles.actionButtonText}>Close Case</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#1e293b',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  welcomeText: { color: '#f8fafc', fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  logoutButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: -15,
    borderRadius: 15,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#4338ca' },
  tabText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '700' },

  content: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 22, fontWeight: '800', marginBottom: 20, color: '#1e293b', letterSpacing: -0.5 },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#64748b',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  cardText: { fontSize: 14, color: '#64748b', marginBottom: 6, lineHeight: 20 },
  helpText: { fontSize: 13, color: '#94a3b8', marginBottom: 15, fontStyle: 'italic' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  statCard: {
    width: '45.5%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    margin: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4338ca',
    shadowColor: '#4338ca',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1e293b' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Table & Search
  searchContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  searchIcon: { marginRight: 10, opacity: 0.5 },
  searchInput: { flex: 1, fontSize: 15, color: '#1e293b' },

  tableContainer: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 14, alignItems: 'center' },
  tableHeader: { backgroundColor: '#f8fafc', borderBottomWidth: 2, borderBottomColor: '#e2e8f0' },
  headerCell: { fontWeight: '700', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  cell: { paddingHorizontal: 12, fontSize: 14, color: '#334155' },

  miniBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  miniBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  verifiedBadgeYes: { backgroundColor: '#10b981' },
  verifiedBadgeNo: { backgroundColor: '#f59e0b' },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    width: '92%',
    height: '85%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 20,
    marginBottom: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  closeBtn: { marginTop: 20, backgroundColor: '#f1f5f9', padding: 16, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#475569', fontWeight: '700', fontSize: 16 },

  infoSection: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 24 },
  infoLabel: { fontWeight: '700', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  infoVal: { fontSize: 16, color: '#1e293b', marginTop: 4, fontWeight: '500' },

  subHeader: { fontSize: 18, fontWeight: '800', marginTop: 10, marginBottom: 12, color: '#4338ca' },
  miniCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
  },

  // Inputs & Buttons
  inputGroup: { marginBottom: 20 },
  inputLabel: { marginBottom: 8, fontWeight: '700', color: '#475569', fontSize: 14 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1e293b'
  },
  saveBtn: {
    backgroundColor: '#4338ca',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#4338ca',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  smDate: { fontSize: 12, color: '#94a3b8', marginTop: 8, fontWeight: '500' },

  // Compliance Tab Styles
  disputeStats: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  disputeStatCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  disputeStatValue: { fontSize: 28, fontWeight: '800', color: '#1e293b' },
  disputeStatLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' },
  subSectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15, color: '#475569' },
  emptyText: { fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', marginVertical: 20 },
  disputeCard: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  resolvedDisputeCard: { borderLeftWidth: 4, borderLeftColor: '#10b981', opacity: 0.7 },
  disputeInfo: { flexDirection: 'row', marginBottom: 8 },
  disputeLabel: { fontWeight: '700', color: '#64748b', width: 80, fontSize: 13 },
  disputeValue: { flex: 1, color: '#1e293b', fontSize: 13 },
  disputeReasonBox: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  disputeReasonLabel: { fontWeight: '700', color: '#92400e', fontSize: 12, marginBottom: 6 },
  disputeReasonText: { color: '#78350f', fontSize: 14, lineHeight: 20 },
  reviewBtn: {
    backgroundColor: '#4338ca',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  reviewBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  contactSection: { marginTop: 20 },
  contactCard: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactRole: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6 },
  contactName: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  contactDetail: { fontSize: 13, color: '#475569', marginTop: 2 },
  reasonSection: { marginTop: 20 },
  reasonText: {
    backgroundColor: '#fef3c7',
    padding: 14,
    borderRadius: 12,
    color: '#78350f',
    fontSize: 14,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  notesSection: { marginTop: 20 },
  notesInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    height: 100,
    textAlignVertical: 'top',
    color: '#1e293b',
  },
  actionButtons: { marginTop: 20, gap: 10 },
  actionButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  inReviewBtn: { backgroundColor: '#3b82f6' },
  resolveBtn: { backgroundColor: '#10b981' },
  closeDisputeBtn: { backgroundColor: '#64748b' },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});