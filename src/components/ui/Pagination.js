/**
 * Pagination Component for Admin Dashboard V5
 * Used to navigate between pages in long lists
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const Pagination = ({ currentPage, totalPages, onPageChange, className }) => {
    if (totalPages <= 1) return null;

    const handlePrevious = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    };

    return (
        <View style={[styles.container, className && { paddingVertical: 0 }]}>
            <TouchableOpacity
                style={[styles.button, currentPage === 1 && styles.buttonDisabled]}
                onPress={handlePrevious}
                disabled={currentPage === 1}
            >
                <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#475569' : '#3b82f6'} />
                <Text style={[styles.buttonText, currentPage === 1 && styles.buttonTextDisabled]}>Previous</Text>
            </TouchableOpacity>

            <Text style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
            </Text>

            <TouchableOpacity
                style={[styles.button, currentPage === totalPages && styles.buttonDisabled]}
                onPress={handleNext}
                disabled={currentPage === totalPages}
            >
                <Text style={[styles.buttonText, currentPage === totalPages && styles.buttonTextDisabled]}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? '#475569' : '#3b82f6'} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingVertical: 16,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    buttonDisabled: {
        backgroundColor: 'transparent',
        borderColor: '#475569',
    },
    buttonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3b82f6',
    },
    buttonTextDisabled: {
        color: '#475569',
    },
    pageInfo: {
        fontSize: 14,
        color: '#94a3b8',
        fontWeight: '500',
    },
});
