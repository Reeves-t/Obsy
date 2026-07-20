import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface VoiceRecordingOverlayProps {
    elapsed: number;
    onStop: () => void;
    onCancel: () => void;
}

function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
}

/** Inline recording strip shown in the composer while the mic is live. */
export function VoiceRecordingOverlay({ elapsed, onStop, onCancel }: VoiceRecordingOverlayProps) {
    const { colors, isLight } = useObsyTheme();
    const ledOpacity = useSharedValue(1);

    useEffect(() => {
        ledOpacity.value = withRepeat(
            withTiming(0.3, { duration: 550, easing: Easing.inOut(Easing.ease) }),
            -1,
            true
        );
        return () => cancelAnimation(ledOpacity);
    }, [ledOpacity]);

    const ledStyle = useAnimatedStyle(() => ({
        opacity: ledOpacity.value,
    }));

    const border = isLight ? colors.cardBorder : 'rgba(255,255,255,0.12)';
    const secondary = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.55)';

    return (
        <View style={[styles.row, { borderColor: border }]}>
            <Animated.View style={[styles.led, ledStyle]} />
            <ThemedText style={[styles.time, { color: colors.text }]}>
                {formatTime(elapsed)}
            </ThemedText>
            <ThemedText style={[styles.status, { color: secondary }]}>Recording…</ThemedText>

            <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} style={[styles.cancelButton, { borderColor: border }]}>
                    <ThemedText style={[styles.cancelText, { color: secondary }]}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={onStop} style={styles.stopButton}>
                    <View style={styles.stopGlyph} />
                    <ThemedText style={styles.stopText}>Stop</ThemedText>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderRadius: 13,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 10,
    },
    led: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#B03058',
    },
    time: {
        fontSize: 14,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    status: {
        fontSize: 12.5,
        flex: 1,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cancelButton: {
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    cancelText: {
        fontSize: 12,
        fontWeight: '600',
    },
    stopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#B03058',
        borderRadius: 9,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    stopGlyph: {
        width: 9,
        height: 9,
        borderRadius: 1.5,
        backgroundColor: '#FFFFFF',
    },
    stopText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
