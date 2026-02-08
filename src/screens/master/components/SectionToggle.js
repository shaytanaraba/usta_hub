import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';

const SectionToggle = ({ styles, sections, activeSection, onSectionChange }) => {
    const { theme } = useTheme();
    return (
        <View style={[styles.sectionToggle, { backgroundColor: theme.bgSecondary, borderColor: theme.borderPrimary }]}>
            {sections.map(sec => (
                <TouchableOpacity
                    key={sec.key}
                    style={[styles.sectionBtn, activeSection === sec.key && { backgroundColor: theme.bgCard }]}
                    onPress={() => onSectionChange(sec.key)}
                >
                    <Text style={[styles.sectionBtnText, { color: activeSection === sec.key ? theme.accentIndigo : theme.textSecondary }]}>
                        {sec.label} {sec.count !== undefined && `(${sec.count})`}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

export default SectionToggle;
