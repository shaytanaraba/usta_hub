import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';

const SkeletonOrderCard = ({ styles, width }) => {
    const { theme } = useTheme();
    const pulse = useRef(new Animated.Value(0.55)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.9, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
                Animated.timing(pulse, { toValue: 0.55, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [pulse]);

    return (
        <Animated.View style={[styles.skeletonCard, { backgroundColor: theme.bgCard, borderColor: theme.borderPrimary, width, opacity: pulse }]}>
            <View style={styles.skeletonHeader}>
                <View style={styles.skeletonLineWide} />
                <View style={styles.skeletonLineShort} />
            </View>
            <View style={styles.skeletonMeta}>
                <View style={styles.skeletonBadge} />
                <View style={styles.skeletonLineTiny} />
            </View>
            <View style={styles.skeletonDesc}>
                <View style={styles.skeletonLineFull} />
                <View style={styles.skeletonLineMid} />
            </View>
            <View style={styles.skeletonInfoBlock}>
                <View style={styles.skeletonLineMid} />
                <View style={styles.skeletonLineMid} />
                <View style={styles.skeletonLineFull} />
            </View>
            <View style={styles.skeletonAction} />
        </Animated.View>
    );
};

export default SkeletonOrderCard;
