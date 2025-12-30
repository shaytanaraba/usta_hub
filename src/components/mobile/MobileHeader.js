import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

/**
 * Mobile Header Component
 * Shows on mobile devices with hamburger menu
 */
export default function MobileHeader({
    title,
    user,
    onMenuPress,
    rightAction
}) {
    return (
        <View style={styles.header}>
            <TouchableOpacity
                style={styles.menuButton}
                onPress={onMenuPress}
            >
                <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>

            <View style={styles.titleContainer}>
                <Text style={styles.title}>{title}</Text>
                {user && (
                    <Text style={styles.subtitle}>
                        {user.name}
                    </Text>
                )}
            </View>

            {rightAction || <View style={styles.placeholder} />}
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#007bff',
        ...Platform.select({
            ios: {
                paddingTop: 50, // Account for status bar
            },
            android: {
                paddingTop: 12,
                elevation: 4,
            },
            web: {
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            },
        }),
    },
    menuButton: {
        padding: 8,
    },
    menuIcon: {
        fontSize: 24,
        color: '#fff',
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    subtitle: {
        fontSize: 12,
        color: '#e3f2fd',
    },
    placeholder: {
        width: 40,
    },
});
