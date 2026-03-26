import React, { useState, useCallback } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Platform,
} from 'react-native';
import { useObsyTheme, type ThemeMode } from '@/contexts/ThemeContext';

// ── Journal Theme Config ────────────────────────────────────────────
// Extensible: add a new entry here for each new ThemeMode
interface JournalThemeColors {
    lineColor: string;
    textColor: string;
    placeholderColor: string;
}

const JOURNAL_THEMES: Record<ThemeMode, JournalThemeColors> = {
    dark: {
        lineColor: 'rgba(255, 255, 255, 0.15)',
        textColor: '#FFFFFF',
        placeholderColor: 'rgba(255, 255, 255, 0.4)',
    },
    light: {
        lineColor: 'rgba(101, 67, 33, 0.30)',
        textColor: '#2C1810',
        placeholderColor: 'rgba(44, 24, 16, 0.4)',
    },
};

const LINE_HEIGHT = 28;
const PADDING = 20;

// ── Component ───────────────────────────────────────────────────────
interface LinedJournalInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

export function LinedJournalInput({
    value,
    onChangeText,
    placeholder = 'Write anything about this moment...',
    autoFocus = true,
}: LinedJournalInputProps) {
    const { theme } = useObsyTheme();
    const journalColors = JOURNAL_THEMES[theme];

    const [scrollOffset, setScrollOffset] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);
    const [contentHeight, setContentHeight] = useState(0);

    const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
        setContainerHeight(e.nativeEvent.layout.height);
    }, []);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        setScrollOffset(e.nativeEvent.contentOffset.y);
    }, []);

    const handleContentSizeChange = useCallback(
        (_w: number, h: number) => {
            setContentHeight(h);
        },
        []
    );

    // Use whichever is larger: visible container, text content, or a safe minimum
    const effectiveHeight = Math.max(containerHeight, contentHeight, 800);
    const numLines = Math.ceil((effectiveHeight + PADDING * 2) / LINE_HEIGHT) + 10;

    return (
        <View style={styles.container} onLayout={handleLayout}>
            {/* Ruled lines layer — behind the text */}
            <View
                style={[
                    styles.linesLayer,
                    { transform: [{ translateY: -scrollOffset }] },
                ]}
                pointerEvents="none"
            >
                {/* Top padding spacer to align with TextInput padding */}
                <View style={{ height: PADDING }} />
                {Array.from({ length: numLines }, (_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.line,
                            { height: LINE_HEIGHT, borderBottomColor: journalColors.lineColor },
                        ]}
                    />
                ))}
            </View>

            {/* TextInput layer — on top, transparent bg so lines show through */}
            <TextInput
                style={[
                    styles.textInput,
                    { color: journalColors.textColor },
                ]}
                placeholder={placeholder}
                placeholderTextColor={journalColors.placeholderColor}
                multiline
                textAlignVertical="top"
                value={value}
                onChangeText={onChangeText}
                onScroll={handleScroll}
                onContentSizeChange={handleContentSizeChange}
                autoFocus={autoFocus}
                scrollEventThrottle={16}
                underlineColorAndroid="transparent"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
        overflow: 'visible',
    },
    linesLayer: {
        position: 'absolute',
        top: 0,
        left: PADDING,
        right: PADDING,
        zIndex: 0,
    },
    line: {
        borderBottomWidth: 1,
    },
    textInput: {
        flex: 1,
        padding: PADDING,
        fontSize: 18,
        lineHeight: LINE_HEIGHT,
        backgroundColor: 'transparent',
        zIndex: 1,
        // Android: remove default underline and background
        ...Platform.select({
            android: {
                textAlignVertical: 'top' as const,
            },
        }),
    },
});
