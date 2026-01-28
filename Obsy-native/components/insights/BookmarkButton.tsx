import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withSequence,
    withTiming
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface BookmarkButtonProps {
    isSaved: boolean;
    onPress: () => void;
    disabled?: boolean;
    size?: number;
}

export const BookmarkButton: React.FC<BookmarkButtonProps> = ({
    isSaved,
    onPress,
    disabled = false,
    size = 20
}) => {
    const { colors } = useObsyTheme();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const handlePress = () => {
        if (disabled) return;

        // Vibration
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Animation
        scale.value = withSequence(
            withSpring(1.2, { damping: 10, stiffness: 200 }),
            withSpring(1.0, { damping: 10, stiffness: 200 })
        );

        onPress();
    };

    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePress}
            disabled={disabled}
            style={styles.container}
        >
            <Animated.View style={animatedStyle}>
                <Ionicons
                    name={isSaved ? "bookmark" : "bookmark-outline"}
                    size={size}
                    color={
                        disabled
                            ? colors.cardTextSecondary
                            : (isSaved
                                ? colors.cardText
                                : colors.cardTextSecondary
                            )
                    }
                />
            </Animated.View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 8,
    },
});
