/**
 * Search Input Component for Admin Dashboard V5
 * Used across Orders, Masters, Staff, and Commission tabs
 */

import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const SearchInput = ({ value, onChange, placeholder = "Search..." }) => {
    return (
        <View style={styles.container}>
            <Ionicons name="search" size={18} color="#64748b" style={styles.icon} />
            <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor="#64748b"
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                autoCorrect={false}
            />
            {value ? (
                <TouchableOpacity onPress={() => onChange('')} style={styles.clearButton}>
                    <Ionicons name="close-circle" size={18} color="#64748b" />
                </TouchableOpacity>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    icon: {
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 14,
        color: '#ffffff',
        paddingVertical: 0,
    },
    clearButton: {
        padding: 4,
    },
});
