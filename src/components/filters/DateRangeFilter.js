/**
 * Date Range Filter Component for Admin Dashboard V5
 * Allows filtering by All, Today, Week, Month, or Custom date range
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

export const DateRangeFilter = ({ value, onChange, isDark = true }) => {
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const buttons = [
        { type: 'all', label: 'All' },
        { type: 'today', label: 'Today' },
        { type: 'week', label: 'Week' },
        { type: 'month', label: 'Month' },
        { type: 'custom', label: 'Custom' },
    ];

    const handleTypeChange = (type) => {
        onChange({ type, start: undefined, end: undefined });
    };

    const handleDateChange = (event, selectedDate, field) => {
        if (Platform.OS === 'android') {
            setShowStartPicker(false);
            setShowEndPicker(false);
        }

        if (selectedDate) {
            onChange({
                ...value,
                [field]: selectedDate.toISOString().split('T')[0],
            });
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.buttonRow, !isDark && styles.buttonRowLight]}>
                {buttons.map((btn) => (
                    <TouchableOpacity
                        key={btn.type}
                        style={[
                            styles.button,
                            value.type === btn.type && styles.buttonActive,
                        ]}
                        onPress={() => handleTypeChange(btn.type)}
                    >
                        <Text
                            style={[
                                styles.buttonText,
                                value.type === btn.type && styles.buttonTextActive,
                                !isDark && value.type !== btn.type && styles.textDark
                            ]}
                        >
                            {btn.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {value.type === 'custom' && (
                <View style={styles.customRow}>
                    <TouchableOpacity
                        style={[styles.dateButton, !isDark && styles.dateButtonLight]}
                        onPress={() => setShowStartPicker(true)}
                    >
                        <Text style={styles.dateLabel}>Start:</Text>
                        <Text style={[styles.dateValue, !isDark && styles.textDark]}>
                            {value.start || 'Select date'}
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.separator, !isDark && styles.textDark]}>→</Text>

                    <TouchableOpacity
                        style={[styles.dateButton, !isDark && styles.dateButtonLight]}
                        onPress={() => setShowEndPicker(true)}
                    >
                        <Text style={styles.dateLabel}>End:</Text>
                        <Text style={[styles.dateValue, !isDark && styles.textDark]}>
                            {value.end || 'Select date'}
                        </Text>
                    </TouchableOpacity>

                    {showStartPicker && (
                        <DateTimePicker
                            value={value.start ? new Date(value.start) : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(e, d) => handleDateChange(e, d, 'start')}
                            maximumDate={new Date()}
                        />
                    )}

                    {showEndPicker && (
                        <DateTimePicker
                            value={value.end ? new Date(value.end) : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(e, d) => handleDateChange(e, d, 'end')}
                            maximumDate={new Date()}
                            minimumDate={value.start ? new Date(value.start) : undefined}
                        />
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    buttonRow: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 4,
        alignSelf: 'flex-start', // Keep it compact
        borderWidth: 1,
        borderColor: '#1e293b',
    },
    buttonRowLight: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
    },
    button: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 8,
    },
    buttonActive: {
        backgroundColor: '#3b82f6',
    },
    buttonText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#64748b',
    },
    buttonTextActive: {
        color: '#ffffff',
        fontWeight: '600',
    },
    textDark: {
        color: '#0f172a',
    },
    customRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    dateButton: {
        flex: 1,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 8,
        padding: 12,
    },
    dateButtonLight: {
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
    },
    dateLabel: {
        fontSize: 11,
        color: '#94a3b8',
        marginBottom: 2,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    dateValue: {
        fontSize: 14,
        color: '#ffffff',
        fontWeight: '500',
    },
    separator: {
        fontSize: 16,
        color: '#64748b',
    },
});
