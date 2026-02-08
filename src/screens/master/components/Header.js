import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { LogOut, Moon, RotateCw, Sun, Wallet } from 'lucide-react-native';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useTheme } from '../../../contexts/ThemeContext';

const Header = ({ styles, user, financials, onLogout, onLanguageToggle, onThemeToggle, onRefresh, topInset = 0 }) => {
    const { language } = useLocalization();
    const { theme, isDark } = useTheme();
    const getFlagEmoji = () => ({ ru: '🇷🇺', kg: '🇰🇬' }[language] || '🇬🇧');
    const headerTopPadding = Math.max(8, topInset || 0);

    return (
        <View style={[styles.header, { paddingTop: headerTopPadding }]}>
            <View style={styles.headerLeft}>
                {user ? (
                    <>
                        {/* User name and balance mini badge */}
                        <Text style={[styles.userName, { color: theme.textPrimary }]} numberOfLines={1}>{user.full_name || 'Master'}</Text>
                        {financials && (
                            <View style={[styles.balanceMini, { backgroundColor: financials.balanceBlocked ? `${theme.accentDanger}15` : `${theme.accentIndigo}15` }]}>
                                <Wallet size={12} color={financials.balanceBlocked ? theme.accentDanger : theme.accentIndigo} />
                                <Text style={{ color: financials.balanceBlocked ? theme.accentDanger : theme.accentIndigo, fontSize: 11, fontWeight: '600' }}>
                                    {financials.prepaidBalance?.toFixed(0) || 0}
                                </Text>
                            </View>
                        )}
                    </>
                ) : <View style={[styles.skeletonName, { backgroundColor: theme.borderSecondary }]} />}
            </View>
            <View style={styles.headerRight}>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onRefresh}><RotateCw size={18} color={theme.accentIndigo} /></TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onLanguageToggle}><Text style={{ fontSize: 16 }}>{getFlagEmoji()}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: theme.bgCard }]} onPress={onThemeToggle}>{isDark ? <Sun size={18} color="#FFD700" /> : <Moon size={18} color={theme.accentIndigo} />}</TouchableOpacity>
                <TouchableOpacity style={[styles.headerButton, { backgroundColor: `${theme.accentDanger}15` }]} onPress={onLogout}><LogOut size={18} color={theme.accentDanger} /></TouchableOpacity>
            </View>
        </View>
    );
};

export default Header;
