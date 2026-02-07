import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform, Modal } from 'react-native';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react-native';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info', duration = 3500) => {
        if (!message) return;

        const id = Date.now() + Math.random();
        const newToast = { id, message: String(message), type, duration };

        setToasts(prev => [...prev.slice(-2), newToast]);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, dismissToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    );
};

const ToastContainer = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <Modal transparent visible animationType="none" onRequestClose={() => {}}>
            <View style={styles.container} pointerEvents="box-none">
                {toasts.map(toast => (
                    <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
                ))}
            </View>
        </Modal>
    );
};

const Toast = ({ toast, onDismiss }) => {
    const [fadeAnim] = useState(new Animated.Value(0));

    React.useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    const getBackgroundColor = () => {
        switch (toast.type) {
            case 'success': return '#28a745';
            case 'error': return '#dc3545';
            case 'warning': return '#f59e0b';
            case 'info': return '#17a2b8';
            default: return '#6c757d';
        }
    };

    const getIcon = () => {
        switch (toast.type) {
            case 'success': return <CheckCircle2 size={18} color="#fff" />;
            case 'error': return <XCircle size={18} color="#fff" />;
            case 'warning': return <AlertTriangle size={18} color="#111827" />;
            case 'info': return <Info size={18} color="#fff" />;
            default: return <Info size={18} color="#fff" />;
        }
    };

    const warningTone = toast.type === 'warning';
    const textColor = warningTone ? '#111827' : '#ffffff';

    return (
        <Animated.View
            style={[
                styles.toast,
                { backgroundColor: getBackgroundColor(), opacity: fadeAnim },
            ]}
        >
            <View style={styles.iconWrap}>{getIcon()}</View>
            <Text style={[styles.message, { color: textColor }]}>{toast.message}</Text>
            <TouchableOpacity onPress={() => onDismiss(toast.id)} style={styles.closeButton}>
                <X size={16} color={textColor} />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 20 : 50,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 99999,
        elevation: 99999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginVertical: 4,
        marginHorizontal: 16,
        borderRadius: 8,
        minWidth: 250,
        maxWidth: 440,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    iconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    message: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
    },
    closeButton: {
        marginLeft: 12,
        padding: 4,
    },
});
