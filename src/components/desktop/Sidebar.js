import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

/**
 * Desktop Sidebar Navigation
 * Only shown on desktop/tablet screens
 */
export default function Sidebar({
    user,
    currentRoute,
    onNavigate,
    onLogout,
    menuItems = []
}) {
    const renderMenuItem = (item) => {
        const isActive = currentRoute === item.route;

        return (
            <TouchableOpacity
                key={item.route}
                style={[styles.menuItem, isActive && styles.activeMenuItem]}
                onPress={() => onNavigate(item.route)}
            >
                {item.icon && <Text style={styles.menuIcon}>{item.icon}</Text>}
                <Text style={[
                    styles.menuText,
                    isActive && styles.activeMenuText
                ]}>
                    {item.label}
                </Text>
                {item.badge && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.sidebar}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.logo}>🔧 Master KG</Text>
                <View style={styles.userInfo}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {user?.name?.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.userName}>{user?.name}</Text>
                        <Text style={styles.userType}>
                            {user?.userType?.charAt(0).toUpperCase() + user?.userType?.slice(1)}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Menu Items */}
            <ScrollView style={styles.menu}>
                {menuItems.map(renderMenuItem)}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={onLogout}
                >
                    <Text style={styles.logoutIcon}>🚪</Text>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    sidebar: {
        width: 280,
        backgroundColor: '#1e293b',
        height: '100vh',
        borderRightWidth: 1,
        borderRightColor: '#334155',
    },
    header: {
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    logo: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#3b82f6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    userName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    userType: {
        color: '#94a3b8',
        fontSize: 14,
    },
    menu: {
        flex: 1,
        paddingVertical: 16,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 24,
        marginHorizontal: 12,
        borderRadius: 8,
        cursor: 'pointer',
    },
    activeMenuItem: {
        backgroundColor: '#3b82f6',
    },
    menuIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    menuText: {
        color: '#cbd5e1',
        fontSize: 16,
        flex: 1,
    },
    activeMenuText: {
        color: '#fff',
        fontWeight: '600',
    },
    badge: {
        backgroundColor: '#ef4444',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        minWidth: 24,
        alignItems: 'center',
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: '#334155',
        cursor: 'pointer',
    },
    logoutIcon: {
        fontSize: 20,
        marginRight: 12,
    },
    logoutText: {
        color: '#fff',
        fontSize: 16,
    },
});
