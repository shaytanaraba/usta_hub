
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';

export const Sidebar = ({ activeTab, onTabChange, onLogout, isCollapsed, onToggle }) => {
    const menuItems = [
        { key: 'overview', label: 'Overview', icon: 'grid-outline', lib: Ionicons },
        { key: 'orders', label: 'Orders', icon: 'clipboard-list', lib: FontAwesome5 },
        { key: 'masters', label: 'Masters', icon: 'people-outline', lib: Ionicons },
        { key: 'staff', label: 'Staff', icon: 'id-card-alt', lib: FontAwesome5 },
        { key: 'commission', label: 'Commission', icon: 'cash-outline', lib: Ionicons },
        { key: 'settings', label: 'Settings', icon: 'settings-outline', lib: Ionicons },
    ];

    return (
        <View style={[styles.container, isCollapsed && styles.containerCollapsed]}>
            {/* Logo Section */}
            <View style={[styles.logoSection, isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }]}>
                <TouchableOpacity onPress={onToggle} style={styles.logoIcon}>
                    <Text style={styles.logoText}>A</Text>
                </TouchableOpacity>
                {!isCollapsed && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.appName}>Admin V5</Text>
                        <TouchableOpacity onPress={onToggle}>
                            <Ionicons name="chevron-back" size={20} color="#64748b" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Menu Items */}
            <View style={styles.menuContainer}>
                {menuItems.map((item) => {
                    const IconLib = item.lib;
                    const isActive = activeTab === item.key;

                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={[
                                styles.menuItem,
                                isActive && styles.menuItemActive,
                                isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }
                            ]}
                            onPress={() => onTabChange(item.key)}
                        >
                            <IconLib
                                name={item.icon}
                                size={20}
                                color={isActive ? '#ffffff' : '#94a3b8'}
                                style={[
                                    { width: 24, textAlign: 'center' },
                                    !isCollapsed && { marginRight: 12 }
                                ]}
                            />
                            {!isCollapsed && (
                                <Text style={[styles.menuText, isActive && styles.menuTextActive]}>
                                    {item.label}
                                </Text>
                            )}
                            {isActive && !isCollapsed && <View style={styles.activeIndicator} />}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Bottom Section */}
            <View style={styles.bottomSection}>
                {!isCollapsed && (
                    <View style={styles.togglesRow}>
                        <TouchableOpacity style={styles.toggleBtn}>
                            <Text style={{ fontSize: 16 }}>🇬🇧</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toggleBtn}>
                            <Ionicons name="sunny-outline" size={18} color="#fbbf24" />
                        </TouchableOpacity>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.logoutButton, isCollapsed && { borderWidth: 0, backgroundColor: 'transparent' }]}
                    onPress={onLogout}
                >
                    {isCollapsed ? (
                        <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                    ) : (
                        <Text style={styles.logoutText}>Log Out</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 260,
        backgroundColor: '#0f172a', // Deep Navy Sidebar
        height: '100%',
        borderRightWidth: 1,
        borderRightColor: '#1e293b',
        paddingVertical: 24,
        paddingHorizontal: 16,
        display: Platform.OS === 'web' ? 'flex' : 'none', // Hide on mobile for now (use drawer logic later if needed)
        transition: 'width 0.3s ease', // Only works on Web
    },
    containerCollapsed: {
        width: 80,
        paddingHorizontal: 12,
    },
    logoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 40,
        paddingHorizontal: 8,
        justifyContent: 'space-between',
    },
    logoIcon: {
        width: 32,
        height: 32,
        backgroundColor: '#3b82f6',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        // marginRight: 12, // Removed as it's conditional now
    },
    logoText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
    },
    appName: {
        color: '#ffffff',
        fontSize: 18, // Changed from 20
        fontWeight: '700',
        letterSpacing: 0.5,
        marginRight: 8, // Added
    },
    menuContainer: {
        flex: 1,
        gap: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        position: 'relative',
        height: 48, // Added
    },
    menuItemActive: {
        backgroundColor: '#3b82f6', // Bright Blue Active State
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    menuText: {
        color: '#94a3b8',
        fontSize: 14, // Changed from 15
        fontWeight: '500',
    },
    menuTextActive: {
        color: '#ffffff',
        fontWeight: '600',
    },
    activeIndicator: {
        position: 'absolute',
        right: 0,
        width: 4,
        height: '80%',
        backgroundColor: '#ffffff',
        borderRadius: 2,
    },
    bottomSection: {
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
        paddingTop: 20,
    },
    togglesRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    toggleBtn: {
        flex: 1,
        backgroundColor: '#1e293b',
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    logoutButton: {
        width: '100%',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ef4444',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    logoutText: {
        color: '#ef4444',
        fontWeight: '600',
        fontSize: 14,
    },
});
