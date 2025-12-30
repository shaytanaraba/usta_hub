import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import auth from '../services/auth';
import { checkVerificationRequirements } from '../config/verificationRequirements';
import { useToast } from '../contexts/ToastContext';

export default function PlumberProfileSettings({ navigation }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [profileData, setProfileData] = useState({
        serviceArea: '',
        experience: '',
        licenseNumber: '',
    });
    const [specializations, setSpecializations] = useState([]);
    const [verificationStatus, setVerificationStatus] = useState(null);

    const { showToast } = useToast();

    const specializationsList = [
        'residential',
        'commercial',
        'emergency',
        'installations',
        'repairs',
    ];

    useEffect(() => {
        loadUserData();
    }, []);

    const loadUserData = async () => {
        const currentUser = await auth.getCurrentUser();
        setUser(currentUser);

        // Pre-fill existing data
        if (currentUser) {
            setProfileData({
                serviceArea: currentUser.service_area || '',
                experience: currentUser.experience || '',
                licenseNumber: currentUser.license_number || '',
            });
            setSpecializations(currentUser.specializations || []);

            // Check verification readiness
            const check = checkVerificationRequirements({
                ...currentUser, // Use current user data for check
                service_area: currentUser.service_area,
                experience: currentUser.experience,
                specializations: currentUser.specializations
            });
            setVerificationStatus(check);
        }
    };

    const toggleSpecialization = (spec) => {
        setSpecializations(prev =>
            prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
        );
    };

    const handleSave = async () => {
        if (!profileData.serviceArea.trim()) {
            showToast('Service area is required', 'error');
            return;
        }

        if (!profileData.experience || isNaN(profileData.experience)) {
            showToast('Please enter valid years of experience', 'error');
            return;
        }

        if (specializations.length === 0) {
            showToast('Please select at least one specialization', 'error');
            return;
        }

        setLoading(true);

        try {
            const updates = {
                serviceArea: profileData.serviceArea,
                experience: profileData.experience,
                licenseNumber: profileData.licenseNumber,
                specializations: specializations,
            };

            const result = await auth.updateProfile(user.id, updates);

            if (result.success) {
                showToast('Profile updated successfully!', 'success');
                // Update user state with returned updated user
                setUser(result.user);

                // Re-check verification
                const check = checkVerificationRequirements({
                    ...result.user,
                    service_area: result.user.service_area,
                    experience: result.user.experience,
                    specializations: result.user.specializations
                });
                setVerificationStatus(check);

                setTimeout(() => navigation.goBack(), 1500);
            } else {
                showToast(result.message || 'Failed to update profile', 'error');
            }
        } catch (error) {
            console.error('Save error:', error);
            showToast('An unexpected error occurred', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backButton}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Complete Your Profile</Text>
            </View>

            {/* Verification Status Banner */}
            {user && (
                <View style={[
                    styles.statusCard,
                    user.is_verified ? styles.statusVerified : styles.statusUnverified
                ]}>
                    <Text style={styles.statusTitle}>
                        Status: {user.is_verified ? '✅ VERIFIED' : '❌ UNVERIFIED'}
                    </Text>
                    <Text style={styles.statusText}>
                        {user.is_verified
                            ? 'Your account is verified. You can claim and perform jobs.'
                            : 'Complete your profile to request verification.'}
                    </Text>

                    {!user.is_verified && verificationStatus && !verificationStatus.canVerify && (
                        <View style={styles.missingRequirements}>
                            <Text style={styles.missingTitle}>Missing Requirements:</Text>
                            {verificationStatus.missing.map((req, index) => (
                                <Text key={index} style={styles.missingItem}>• {req}</Text>
                            ))}
                        </View>
                    )}

                    {!user.is_verified && verificationStatus && verificationStatus.canVerify && (
                        <View style={styles.readyForVerification}>
                            <Text style={styles.readyText}>
                                ✅ Your profile is complete!
                            </Text>
                            <Text style={styles.readySubtext}>
                                Admins have been notified and will review your profile shortly.
                            </Text>
                        </View>
                    )}
                </View>
            )}

            <ScrollView style={styles.content}>
                <Text style={styles.description}>
                    Fill in these details to start claiming jobs and building your reputation.
                </Text>

                <Text style={styles.label}>Service Area *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g., Bishkek, Osh, Jalal-Abad"
                    value={profileData.serviceArea}
                    onChangeText={(text) => setProfileData({ ...profileData, serviceArea: text })}
                />

                <Text style={styles.label}>Years of Experience *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g., 5"
                    value={profileData.experience}
                    onChangeText={(text) => setProfileData({ ...profileData, experience: text })}
                    keyboardType="numeric"
                />

                <Text style={styles.label}>License Number (Optional)</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your license number"
                    value={profileData.licenseNumber}
                    onChangeText={(text) => setProfileData({ ...profileData, licenseNumber: text })}
                />

                <Text style={styles.label}>Specializations *</Text>
                <Text style={styles.sublabel}>Select all that apply</Text>
                <View style={styles.specializationsContainer}>
                    {specializationsList.map(spec => (
                        <TouchableOpacity
                            key={spec}
                            style={[
                                styles.specButton,
                                specializations.includes(spec) && styles.specButtonActive,
                            ]}
                            onPress={() => toggleSpecialization(spec)}
                        >
                            <Text
                                style={[
                                    styles.specButtonText,
                                    specializations.includes(spec) && styles.specButtonTextActive,
                                ]}
                            >
                                {spec.charAt(0).toUpperCase() + spec.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={loading}
                >
                    <Text style={styles.saveButtonText}>
                        {loading ? 'Saving...' : 'Save Profile'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
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
        paddingTop: 50,
    },
    backButton: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 10,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    description: {
        fontSize: 14,
        color: '#666',
        marginBottom: 20,
        lineHeight: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        color: '#333',
    },
    sublabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 12,
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dee2e6',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        fontSize: 16,
    },
    specializationsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 24,
        gap: 8,
    },
    specButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#dee2e6',
        backgroundColor: '#fff',
    },
    specButtonActive: {
        backgroundColor: '#007bff',
        borderColor: '#007bff',
    },
    specButtonText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
    },
    specButtonTextActive: {
        color: '#fff',
    },
    saveButton: {
        backgroundColor: '#28a745',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
        marginTop: 20,
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statusCard: {
        margin: 20,
        marginBottom: 0,
        padding: 16,
        borderRadius: 8,
        borderWidth: 1,
    },
    statusVerified: {
        backgroundColor: '#d4edda',
        borderColor: '#c3e6cb',
    },
    statusUnverified: {
        backgroundColor: '#f8d7da',
        borderColor: '#f5c6cb',
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#333',
    },
    statusText: {
        fontSize: 14,
        color: '#555',
        marginBottom: 12,
    },
    missingRequirements: {
        marginTop: 8,
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderRadius: 6,
    },
    missingTitle: {
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#721c24',
    },
    missingItem: {
        fontSize: 14,
        color: '#721c24',
        marginLeft: 8,
    },
    readyForVerification: {
        marginTop: 8,
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderRadius: 6,
    },
    readyText: {
        fontWeight: 'bold',
        color: '#155724',
        fontSize: 16,
    },
    readySubtext: {
        fontSize: 14,
        color: '#155724',
        marginTop: 4,
    },
});
