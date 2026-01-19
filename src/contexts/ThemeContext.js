/**
 * Theme Context
 * Dark/Light theme support with persistence
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@masterkg_theme';

// Theme definitions
export const THEMES = {
    dark: {
        name: 'dark',
        // Backgrounds
        bgPrimary: '#0f172a',
        bgSecondary: '#1e293b',
        bgCard: 'rgba(30, 41, 59, 0.9)',
        bgCardHover: 'rgba(30, 41, 59, 1)',
        bgInput: '#0f172a',
        bgOverlay: 'rgba(0, 0, 0, 0.6)',

        // Text
        textPrimary: '#ffffff',
        textSecondary: '#94a3b8',
        textMuted: '#64748b',
        textInverse: '#0f172a',

        // Borders
        borderPrimary: 'rgba(71, 85, 105, 0.5)',
        borderSecondary: '#334155',
        borderLight: 'rgba(71, 85, 105, 0.3)',

        // Accents (matching V2)
        accentPrimary: '#3b82f6', // Blue
        accentSuccess: '#22c55e', // Green
        accentWarning: '#f59e0b', // Amber
        accentDanger: '#ef4444', // Red
        accentInfo: '#8b5cf6', // Purple
        accentIndigo: '#6366f1', // Indigo

        // Status colors
        statusPlaced: '#3b82f6',
        statusClaimed: '#6366f1',
        statusStarted: '#8b5cf6',
        statusCompleted: '#f97316',
        statusConfirmed: '#22c55e',
        statusCanceled: '#ef4444',

        // Urgency colors
        urgencyEmergency: '#ef4444',
        urgencyUrgent: '#f59e0b',
        urgencyPlanned: '#3b82f6',

        // Tab bar
        tabBarBg: 'rgba(15, 23, 42, 0.95)',
        tabBarBorder: '#1e293b',
        tabActive: '#6366f1',
        tabInactive: '#64748b',
    },

    light: {
        name: 'light',
        // Backgrounds
        bgPrimary: '#f8fafc',
        bgSecondary: '#ffffff',
        bgCard: '#ffffff',
        bgCardHover: '#f1f5f9',
        bgInput: '#f8fafc',
        bgOverlay: 'rgba(0, 0, 0, 0.4)',

        // Text
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        textMuted: '#94a3b8',
        textInverse: '#ffffff',

        // Borders
        borderPrimary: '#e2e8f0',
        borderSecondary: '#cbd5e1',
        borderLight: '#f1f5f9',

        // Accents (same as dark for consistency)
        accentPrimary: '#3b82f6',
        accentSuccess: '#22c55e',
        accentWarning: '#f59e0b',
        accentDanger: '#ef4444',
        accentInfo: '#8b5cf6',
        accentIndigo: '#6366f1',

        // Status colors
        statusPlaced: '#3b82f6',
        statusClaimed: '#6366f1',
        statusStarted: '#8b5cf6',
        statusCompleted: '#f97316',
        statusConfirmed: '#22c55e',
        statusCanceled: '#ef4444',

        // Urgency colors
        urgencyEmergency: '#ef4444',
        urgencyUrgent: '#f59e0b',
        urgencyPlanned: '#3b82f6',

        // Tab bar
        tabBarBg: 'rgba(255, 255, 255, 0.95)',
        tabBarBorder: '#e2e8f0',
        tabActive: '#6366f1',
        tabInactive: '#94a3b8',
    },
};

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
    const [themeName, setThemeName] = useState('dark');

    const theme = THEMES[themeName];
    const isDark = themeName === 'dark';

    // Load saved theme on mount
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved && THEMES[saved]) {
                    setThemeName(saved);
                }
            } catch (error) {
                console.warn('Failed to load theme preference:', error);
            }
        };
        loadTheme();
    }, []);

    // Toggle theme
    const toggleTheme = useCallback(async () => {
        const newTheme = themeName === 'dark' ? 'light' : 'dark';
        setThemeName(newTheme);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, newTheme);
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    }, [themeName]);

    // Set specific theme
    const setTheme = useCallback(async (name) => {
        if (THEMES[name]) {
            setThemeName(name);
            try {
                await AsyncStorage.setItem(STORAGE_KEY, name);
            } catch (error) {
                console.warn('Failed to save theme preference:', error);
            }
        }
    }, []);

    const value = {
        theme,
        themeName,
        isDark,
        toggleTheme,
        setTheme,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
