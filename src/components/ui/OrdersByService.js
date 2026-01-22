import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const OrdersByService = ({ data, isDark = true, translations = {} }) => {
    // data: [{name: 'Appliance Repair', count: 26, percentage: 30}, ...]

    // Safety check
    if (!data || !Array.isArray(data)) return null;

    const maxCount = Math.max(...data.map(d => d.count), 1);

    return (
        <View style={[styles.card, !isDark && styles.cardLight]}>
            <Text style={[styles.title, !isDark && styles.textDark]}>{translations.ordersByService || 'Orders by Service'}</Text>
            <View style={styles.list}>
                {data.map((item) => (
                    <View key={item.name} style={styles.row}>
                        <View style={styles.labelRow}>
                            <Text style={[styles.serviceName, !isDark && styles.textDark]}>{item.name}</Text>
                            <Text style={styles.count}>{item.count}</Text>
                        </View>
                        <View style={[styles.progressBarBg, !isDark && styles.progressBarBgLight]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    { width: `${(item.count / maxCount) * 100}%` }
                                ]}
                            />
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#334155',
        height: 300,
    },
    cardLight: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 20,
    },
    textDark: {
        color: '#0f172a',
    },
    list: {
        flex: 1,
        justifyContent: 'space-around',
    },
    row: {
        marginBottom: 12,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    serviceName: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '500',
    },
    count: {
        color: '#3b82f6',
        fontSize: 14,
        fontWeight: '700',
    },
    progressBarBg: {
        height: 6,
        backgroundColor: '#0f172a',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarBgLight: {
        backgroundColor: '#f1f5f9',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#3b82f6',
        borderRadius: 3,
    },
});
