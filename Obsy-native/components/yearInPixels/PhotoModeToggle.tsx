import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';

export const PhotoModeToggle: React.FC = () => {
    const { colors, isDark } = useObsyTheme();
    const { photoMode, togglePhotoMode } = useYearInPixelsStore();

    return (
        <TouchableOpacity
            style={[
                styles.container,
                {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
                }
            ]}
            onPress={togglePhotoMode}
        >
            <View style={[
                styles.activeIndicator,
                {
                    transform: [{ translateX: photoMode ? 40 : 2 }],
                    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)',
                }
            ]} />

            <View style={styles.iconContainer}>
                <Ionicons
                    name="color-palette"
                    size={16}
                    color={!photoMode ? (isDark ? '#fff' : '#000') : colors.textTertiary}
                />
            </View>

            <View style={styles.iconContainer}>
                <Ionicons
                    name="image"
                    size={16}
                    color={photoMode ? (isDark ? '#fff' : '#000') : colors.textTertiary}
                />
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 80,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 2,
        position: 'relative',
    },
    activeIndicator: {
        position: 'absolute',
        width: 36,
        height: 28,
        borderRadius: 14,
    },
    iconContainer: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
});
