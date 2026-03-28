import React, { forwardRef } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    ScrollView,
    Platform,
} from 'react-native';
import { useObsyTheme, type ThemeMode } from '@/contexts/ThemeContext';

// ── Theme config ─────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const LINE_HEIGHT = 28;
const PADDING = 20;

// Pre-render 120 lines (120 × 28 = 3360 px) — enough for any realistic entry.
// Lines are absolutely positioned at compile-time pixel offsets.
// No onLayout, no scroll sync, no transforms — renders correctly on frame 1.
const TOTAL_LINES = 120;
const TOTAL_HEIGHT = PADDING + TOTAL_LINES * LINE_HEIGHT;

const LINE_TOPS = Array.from(
    { length: TOTAL_LINES },
    (_, i) => PADDING + (i + 1) * LINE_HEIGHT
);

// ── Component ─────────────────────────────────────────────────────────────────

interface LinedJournalInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    /** Default false — caller decides if keyboard should open immediately */
    autoFocus?: boolean;
}

/**
 * forwardRef so the parent can hold a TextInput ref and call .blur()
 * to programmatically dismiss the keyboard without Keyboard.dismiss() quirks.
 */
export const LinedJournalInput = forwardRef<TextInput, LinedJournalInputProps>(
    (
        {
            value,
            onChangeText,
            placeholder = 'Write anything about this moment...',
            autoFocus = false,
        },
        ref
    ) => {
        const { theme } = useObsyTheme();
        const { lineColor, textColor, placeholderColor } = JOURNAL_THEMES[theme];

        return (
            <ScrollView
                style={styles.scrollView}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
            >
                {/*
                 * Single fixed-height container.
                 * Lines are absolutely positioned — they exist from the first
                 * render with no measurement required.
                 * TextInput fills the same container with scrollEnabled=false
                 * so the outer ScrollView drives all scrolling.
                 */}
                <View style={styles.contentContainer}>
                    {LINE_TOPS.map((top, i) => (
                        <View
                            key={i}
                            pointerEvents="none"
                            style={[styles.line, { top, backgroundColor: lineColor }]}
                        />
                    ))}

                    <TextInput
                        ref={ref}
                        style={[styles.textInput, { color: textColor }]}
                        placeholder={placeholder}
                        placeholderTextColor={placeholderColor}
                        multiline
                        scrollEnabled={false}
                        autoFocus={autoFocus}
                        value={value}
                        onChangeText={onChangeText}
                        textAlignVertical="top"
                        underlineColorAndroid="transparent"
                    />
                </View>
            </ScrollView>
        );
    }
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        height: TOTAL_HEIGHT,
        position: 'relative',
    },
    line: {
        position: 'absolute',
        left: PADDING,
        right: PADDING,
        height: StyleSheet.hairlineWidth,
    },
    textInput: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: PADDING,
        fontSize: 18,
        lineHeight: LINE_HEIGHT,
        backgroundColor: 'transparent',
        ...Platform.select({
            android: { textAlignVertical: 'top' as const },
        }),
    },
});
