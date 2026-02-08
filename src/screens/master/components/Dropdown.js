import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';

const Dropdown = ({ styles, label, value, options, optionLabels = {}, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { theme } = useTheme();
    const isActive = value !== 'all';
    const buttonRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const toggleDropdown = () => {
        if (!isOpen && buttonRef.current) {
            buttonRef.current.measure((fx, fy, width, height, px, py) => {
                setPosition({ top: py + height + 4, left: px, width: Math.max(width, 160) });
                setIsOpen(true);
            });
        } else setIsOpen(false);
    };

    return (
        <View style={styles.dropdownWrapper}>
            <TouchableOpacity ref={buttonRef} style={[styles.dropdownButton, {
                backgroundColor: isActive ? `${theme.accentIndigo}15` : theme.bgCard,
                borderColor: isActive ? theme.accentIndigo : theme.borderPrimary,
            }]} onPress={toggleDropdown}>
                <Text style={[styles.dropdownLabel, { color: isActive ? theme.accentIndigo : theme.textSecondary }]}>
                    {value === 'all' ? label : (optionLabels[value] || value)}
                </Text>
                <ChevronDown size={14} color={isActive ? theme.accentIndigo : theme.textMuted} />
            </TouchableOpacity>
            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <Pressable style={styles.dropdownOverlay} onPress={() => setIsOpen(false)}>
                    <View style={[styles.dropdownMenu, { top: position.top, left: position.left, width: position.width, backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
                        <ScrollView style={{ maxHeight: 250 }}>
                            {options.map((opt) => (
                                <TouchableOpacity key={opt} style={[styles.dropdownItem, value === opt && { backgroundColor: `${theme.accentIndigo}15` }]}
                                    onPress={() => { onChange(opt); setIsOpen(false); }}>
                                    <View style={styles.checkIconWrapper}>
                                        {value === opt && <Check size={14} color={theme.accentIndigo} />}
                                    </View>
                                    <Text style={[styles.dropdownItemText, { color: value === opt ? theme.accentIndigo : theme.textPrimary }]}>
                                        {optionLabels[opt] || opt}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

export default Dropdown;
