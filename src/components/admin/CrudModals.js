/**
 * Simple CRUD Modals for Admin
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Alert, Platform, Image } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import auth from '../../services/auth';
import orderService from '../../services/orders';

// Edit Client Modal
export function EditClientModal({ visible, client, onClose, onSave }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (client) {
            setName(client.name || '');
            setEmail(client.email || '');
            setPhone(client.phone || '');
            setPassword('');
        } else {
            // New client
            setName('');
            setEmail('');
            setPhone('');
            setPassword('');
        }
    }, [client]);

    const handleSave = async () => {
        if (!name || !email) {
            Alert.alert('Error', 'Name and email are required');
            return;
        }

        if (!client && !password) {
            Alert.alert('Error', 'Password is required for new clients');
            return;
        }

        try {
            let result;
            if (client) {
                // Update existing
                result = await auth.updateProfile(client.id, { name, email, phone });
                // We cannot update password for existing users from client SDK (requires Service Role)
            } else {
                // Create new
                result = await auth.registerUser({
                    name,
                    email,
                    phone,
                    password,
                    confirmPassword: password, // Auto-confirm for admin creation
                    userType: 'client',
                });
            }

            if (result.success) {
                onSave();
            } else {
                Alert.alert('Error', result.message);
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{client ? 'Edit Client' : 'Add Client'}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.label}>Name *</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Full name"
                        />

                        <Text style={styles.label}>Email {client && '(Read-only)'}</Text>
                        <TextInput
                            style={[styles.input, client && styles.disabledInput]}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="email@example.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!client}
                        />

                        <Text style={styles.label}>Phone</Text>
                        <TextInput
                            style={styles.input}
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="+1234567890"
                            keyboardType="phone-pad"
                        />

                        {!client && (
                            <>
                                <Text style={styles.label}>Password *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={password}
                                    onChangeText={setPassword}
                                    placeholder="••••••••"
                                    secureTextEntry
                                />
                            </>
                        )}

                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.saveBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// Add Order Modal (Admin)
export function AddOrderModal({ visible, onClose, onSave, showToast }) {
    const [clientPhone, setClientPhone] = useState('');
    const [clientName, setClientName] = useState(''); // Optional, used if client created on fly
    const [serviceType, setServiceType] = useState('repair');
    const [problemDescription, setProblemDescription] = useState('');
    const [address, setAddress] = useState('');
    const [urgency, setUrgency] = useState('normal'); // 'normal' | 'high' | 'emergency' -> mapped to 'planned' | 'urgent' (client)
    // admin's 'urgency' state uses 'normal'/'high'/'emergency' strings originally, 
    // but client uses 'planned'/'urgent'. 
    // Let's stick to the existing admin implementation or standardise?
    // The previous implementation used ['normal', 'high', 'emergency']. 
    // Client uses ['planned', 'urgent'].
    // We will align with Client: 'planned' vs 'urgent'.
    const [urgencyType, setUrgencyType] = useState('planned');

    const [preferredDate, setPreferredDate] = useState('');
    const [preferredTime, setPreferredTime] = useState('');
    const [photos, setPhotos] = useState([]);

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);

    useEffect(() => {
        if (visible) {
            const tmr = new Date();
            tmr.setDate(tmr.getDate() + 1);
            setPreferredDate(tmr.toISOString().split('T')[0]);
            setPreferredTime('');
            setPhotos([]);
            setUrgencyType('planned');
        }
    }, [visible]);

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.5,
            });

            if (!result.canceled) {
                setPhotos(prev => [...prev, result.assets[0].uri]);
            }
        } catch (e) {
            Alert.alert('Error', 'Could not pick image');
        }
    };

    const removePhoto = (index) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!clientPhone || !problemDescription || !address) {
            showToast('Client Phone, Description, and Address are required', 'error');
            return;
        }

        try {
            const result = await orderService.createAdminOrder({
                clientPhone,
                clientName,
                serviceType,
                problemDescription,
                address,
                urgency,
                preferredDate,
                preferredTime,
                photos
            });

            if (result.success) {
                onSave();
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add New Order</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.sectionHeader}>Order Details</Text>

                        <Text style={styles.label}>Urgency</Text>
                        <View style={styles.statusOptions}>
                            {['planned', 'urgent'].map(u => (
                                <TouchableOpacity
                                    key={u}
                                    style={[styles.statusOption, urgencyType === u && styles.statusOptionActive]}
                                    onPress={() => setUrgencyType(u)}
                                >
                                    <Text style={[styles.statusOptionText, urgencyType === u && styles.statusOptionTextActive]}>
                                        {u === 'planned' ? 'Planned' : 'Urgent (ASAP)'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {urgencyType === 'planned' && (
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Date</Text>
                                    {Platform.OS === 'web' ? (
                                        <TextInput
                                            style={styles.input}
                                            value={preferredDate}
                                            onChangeText={setPreferredDate}
                                            placeholder="YYYY-MM-DD"
                                        />
                                    ) : (
                                        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                                            <Text>{preferredDate || 'Select Date'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>Time</Text>
                                    {Platform.OS === 'web' ? (
                                        <TextInput
                                            style={styles.input}
                                            value={preferredTime}
                                            onChangeText={setPreferredTime}
                                            placeholder="HH:MM"
                                        />
                                    ) : (
                                        <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker(true)}>
                                            <Text>{preferredTime || 'Select Time'}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}

                        <Text style={styles.sectionHeader}>Service Details</Text>
                        <Text style={styles.label}>Service Type</Text>
                        <View style={styles.statusOptions}>
                            {['repair', 'installation', 'maintenance', 'emergency'].map(type => (
                                <TouchableOpacity
                                    key={type}
                                    style={[styles.statusOption, serviceType === type && styles.statusOptionActive]}
                                    onPress={() => setServiceType(type)}
                                >
                                    <Text style={[styles.statusOptionText, serviceType === type && styles.statusOptionTextActive]}>
                                        {type}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.sectionHeader}>Client & Location</Text>
                        <Text style={styles.label}>Client Phone *</Text>
                        <TextInput
                            style={styles.input}
                            value={clientPhone}
                            onChangeText={setClientPhone}
                            placeholder="+1234567890"
                            keyboardType="phone-pad"
                        />
                        <Text style={styles.label}>Client Name (New/Guest)</Text>
                        <TextInput
                            style={styles.input}
                            value={clientName}
                            onChangeText={setClientName}
                            placeholder="Full Name"
                        />

                        <Text style={styles.label}>Problem Description *</Text>
                        <TextInput
                            style={[styles.input, { height: 80 }]}
                            value={problemDescription}
                            onChangeText={setProblemDescription}
                            placeholder="Describe the issue..."
                            multiline
                        />

                        <Text style={styles.label}>Address *</Text>
                        <TextInput
                            style={styles.input}
                            value={address}
                            onChangeText={setAddress}
                            placeholder="Service address"
                        />

                        {showDatePicker && (
                            <DateTimePicker
                                value={preferredDate ? new Date(preferredDate) : new Date()}
                                mode="date"
                                minimumDate={new Date()}
                                onChange={(e, d) => {
                                    setShowDatePicker(false);
                                    if (d) setPreferredDate(d.toISOString().split('T')[0]);
                                }}
                            />
                        )}
                        {showTimePicker && (
                            <DateTimePicker
                                value={new Date()}
                                mode="time"
                                onChange={(e, d) => {
                                    setShowTimePicker(false);
                                    if (d) setPreferredTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                                }}
                            />
                        )}

                        <Text style={styles.label}>Photos</Text>
                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                            {photos.map((uri, idx) => (
                                <View key={idx} style={{ position: 'relative' }}>
                                    <Image source={{ uri }} style={{ width: 60, height: 60, borderRadius: 8 }} />
                                    <TouchableOpacity
                                        style={{ position: 'absolute', top: -5, right: -5, backgroundColor: 'white', borderRadius: 10 }}
                                        onPress={() => removePhoto(idx)}
                                    >
                                        <Ionicons name="close-circle" size={20} color="red" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            <TouchableOpacity
                                style={{ width: 60, height: 60, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}
                                onPress={pickImage}
                            >
                                <Ionicons name="camera" size={24} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.saveBtnText}>Create Order</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// Edit Plumber Modal
export function EditPlumberModal({ visible, plumber, onClose, onSave }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [experience, setExperience] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (plumber) {
            setName(plumber.name || '');
            setEmail(plumber.email || '');
            setPhone(plumber.phone || '');
            setExperience(plumber.experience?.toString() || '');
            setPassword('');
        } else {
            // New Plumber
            setName('');
            setEmail('');
            setPhone('');
            setExperience('');
            setPassword('');
        }
    }, [plumber]);

    const handleSave = async () => {
        if (!name || !email) {
            Alert.alert('Error', 'Name and email are required');
            return;
        }

        try {
            let result;
            if (plumber) {
                // Update
                result = await auth.updateProfile(plumber.id, {
                    name,
                    email,
                    phone,
                    experience // Pass experience here
                });
                // Note: updating specific plumber profile fields like experience...
                // Password update is disabled for admins to prevent permissions error
            } else {
                // Create
                if (!password) {
                    Alert.alert('Error', 'Password is required for new accounts');
                    return;
                }
                result = await auth.registerUser({
                    name,
                    email,
                    phone,
                    password,
                    confirmPassword: password, // Auto-confirm for admin creation
                    userType: 'plumber'
                });
            }

            if (result.success) {
                onSave();
            } else {
                Alert.alert('Error', result.message);
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{plumber ? 'Edit Plumber' : 'Add Plumber'}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.label}>Name *</Text>
                        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full Name" />

                        <Text style={styles.label}>Email {plumber && '(Read-only)'}</Text>
                        <TextInput
                            style={[styles.input, plumber && styles.disabledInput]}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Email"
                            keyboardType="email-address"
                            editable={!plumber}
                        />

                        <Text style={styles.label}>Phone</Text>
                        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />

                        {plumber && (
                            <>
                                <Text style={styles.label}>Years Experience</Text>
                                <TextInput style={styles.input} value={experience} onChangeText={setExperience} placeholder="e.g. 5" keyboardType="numeric" />
                            </>
                        )}

                        {!plumber && (
                            <>
                                <Text style={styles.label}>Password *</Text>
                                <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
                            </>
                        )}

                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.saveBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// Edit Order Modal
export function EditOrderModal({ visible, order, onClose, onSave }) {
    const [status, setStatus] = useState('');
    const [finalPrice, setFinalPrice] = useState('');

    useEffect(() => {
        if (order) {
            setStatus(order.status || 'pending');
            setFinalPrice(order.completion?.amountCharged?.toString() || '');
        }
    }, [order]);

    const handleSave = async () => {
        if (!order) return;

        try {
            const result = await orderService.updateOrderDetails(order.id, {
                status,
                finalPrice: finalPrice ? parseFloat(finalPrice) : undefined,
            });

            if (result.success) {
                onSave();
            } else {
                Alert.alert('Error', result.message);
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        }
    };

    if (!order) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Edit Order</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.infoText}>Order: #{order.id.slice(0, 8)}</Text>
                        <Text style={styles.infoText}>Client: {order.clientName}</Text>

                        <Text style={styles.label}>Status</Text>
                        <View style={styles.statusOptions}>
                            {['pending', 'claimed', 'in_progress', 'completed', 'verified'].map(s => (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.statusOption, status === s && styles.statusOptionActive]}
                                    onPress={() => setStatus(s)}
                                >
                                    <Text style={[styles.statusOptionText, status === s && styles.statusOptionTextActive]}>
                                        {s}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Final Price (Commission Base)</Text>
                        <Text style={styles.helperText}>
                            Updating this price will affect the calculated commission for this order.
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={finalPrice}
                            onChangeText={setFinalPrice}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                        />

                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                                <Text style={styles.saveBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// Delete Confirmation Modal
export function DeleteConfirmModal({ visible, item, itemType, onClose, onConfirm }) {
    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: 300 }]}>
                    <View style={styles.deleteIcon}>
                        <Ionicons name="warning" size={48} color="#ef4444" />
                    </View>

                    <Text style={styles.deleteTitle}>Delete {itemType}?</Text>
                    <Text style={styles.deleteMessage}>
                        This action cannot be undone. Are you sure you want to delete this {itemType}?
                    </Text>

                    {item && (
                        <Text style={styles.deleteItemInfo}>
                            {item.name || item.clientName || `#${item.id?.slice(0, 8)}`}
                        </Text>
                    )}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={onConfirm}>
                            <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// Stats Detail Modal
export function StatsDetailModal({ visible, title, data, onClose }) {
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{title}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        <Text style={styles.resultCount}>{data.length} items</Text>
                        {data.map((item, index) => (
                            <View key={index} style={styles.listItem}>
                                <Text style={styles.listItemText}>
                                    {item.clientName || item.name || `#${item.id?.slice(0, 8)}`}
                                </Text>
                                <Text style={styles.listItemSubtext}>
                                    {item.status || item.reason || ''}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 500,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1e293b',
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginTop: 20,
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 5,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
        marginTop: 16,
        marginBottom: 8,
    },
    helperText: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 8,
        fontStyle: 'italic',
    },
    input: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#1e293b',
    },
    statusOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    statusOption: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    statusOptionActive: {
        backgroundColor: '#4338ca',
        borderColor: '#4338ca',
    },
    statusOptionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'capitalize',
    },
    statusOptionTextActive: {
        color: '#fff',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
        marginBottom: 10,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#64748b',
    },
    saveBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#4338ca',
        alignItems: 'center',
    },
    saveBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    deleteBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#ef4444',
        alignItems: 'center',
    },
    deleteBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    deleteIcon: {
        alignItems: 'center',
        marginBottom: 16,
    },
    disabledInput: {
        backgroundColor: '#e2e8f0',
        color: '#94a3b8',
    },
    deleteTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 12,
    },
    deleteMessage: {
        fontSize: 15,
        color: '#64748b',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 16,
    },
    deleteItemInfo: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 8,
    },
    resultCount: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 15,
        fontWeight: '600',
    },
    listItem: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    listItemText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: 4,
    },
    listItemSubtext: {
        fontSize: 13,
        color: '#64748b',
    },
});
