import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';

/**
 * Adaptive Button Component
 * Works on mobile and web with appropriate hover states
 */
export default function Button({
    title,
    onPress,
    variant = 'primary',
    size = 'medium',
    loading = false,
    disabled = false,
    icon,
    style,
    textStyle
}) {
    const getVariantStyle = () => {
        switch (variant) {
            case 'primary':
                return styles.primaryButton;
            case 'secondary':
                return styles.secondaryButton;
            case 'success':
                return styles.successButton;
            case 'danger':
                return styles.dangerButton;
            case 'outline':
                return styles.outlineButton;
            default:
                return styles.primaryButton;
        }
    };

    const getSizeStyle = () => {
        switch (size) {
            case 'small':
                return styles.smallButton;
            case 'medium':
                return styles.mediumButton;
            case 'large':
                return styles.largeButton;
            default:
                return styles.mediumButton;
        }
    };

    const getTextVariantStyle = () => {
        switch (variant) {
            case 'outline':
                return styles.outlineButtonText;
            default:
                return styles.buttonText;
        }
    };

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled || loading}
            style={[
                styles.button,
                getVariantStyle(),
                getSizeStyle(),
                (disabled || loading) && styles.disabledButton,
                style
            ]}
            activeOpacity={0.7}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'outline' ? '#007bff' : '#fff'} />
            ) : (
                <>
                    {icon}
                    <Text style={[
                        getTextVariantStyle(),
                        size === 'small' && styles.smallButtonText,
                        size === 'large' && styles.largeButtonText,
                        textStyle
                    ]}>
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        paddingHorizontal: 20,
        ...Platform.select({
            web: {
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            },
        }),
    },
    primaryButton: {
        backgroundColor: '#007bff',
        ...Platform.select({
            web: {
                ':hover': {
                    backgroundColor: '#0056b3',
                },
            },
        }),
    },
    secondaryButton: {
        backgroundColor: '#6c757d',
    },
    successButton: {
        backgroundColor: '#28a745',
    },
    dangerButton: {
        backgroundColor: '#dc3545',
    },
    outlineButton: {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: '#007bff',
    },
    disabledButton: {
        opacity: 0.5,
    },
    smallButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    mediumButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    largeButton: {
        paddingVertical: 16,
        paddingHorizontal: 24,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    outlineButtonText: {
        color: '#007bff',
        fontSize: 16,
        fontWeight: '600',
    },
    smallButtonText: {
        fontSize: 14,
    },
    largeButtonText: {
        fontSize: 18,
    },
});
