import React, { forwardRef } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    ScrollView,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useObsyTheme } from '@/contexts/ThemeContext';

interface JournalThemeColors {
    lineStart: string;
    lineMid: string;
    textColor: string;
    placeholderColor: string;
}

const DARK_JOURNAL_THEME: JournalThemeColors = {
    lineStart: 'rgba(218, 180, 130, 0)',
    lineMid: 'rgba(218, 180, 130, 0.22)',
    textColor: 'rgba(255, 248, 235, 0.96)',
    placeholderColor: 'rgba(255, 230, 190, 0.32)',
};

const LIGHT_JOURNAL_THEME: JournalThemeColors = {
    lineStart: 'rgba(101, 67, 33, 0)',
    lineMid: 'rgba(101, 67, 33, 0.30)',
    textColor: '#2C1810',
    placeholderColor: 'rgba(44, 24, 16, 0.45)',
};

const LINE_HEIGHT = 36;
const PADDING_X = 24;
const TOP_SPACE = 40;
const TOTAL_LINES = 120;
const TOTAL_HEIGHT = TOP_SPACE + TOTAL_LINES * LINE_HEIGHT;

const LINE_TOPS = Array.from(
    { length: TOTAL_LINES },
    (_, i) => TOP_SPACE + (i + 1) * LINE_HEIGHT
);

const SERIF_FONT = Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'serif',
});

interface LinedJournalInputProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

export const LinedJournalInput = forwardRef<TextInput, LinedJournalInputProps>(
    (
        {
            value,
            onChangeText,
            placeholder = 'Write anything about this moment…',
            autoFocus = false,
        },
        ref
    ) => {
        const { isLight } = useObsyTheme();
        const theme = isLight ? LIGHT_JOURNAL_THEME : DARK_JOURNAL_THEME;

        return (
            <ScrollView
                style={styles.scrollView}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.contentContainer}>
                    {LINE_TOPS.map((top, i) => (
                        <LinearGradient
                            key={i}
                            pointerEvents="none"
                            colors={[theme.lineStart, theme.lineMid, theme.lineMid, theme.lineStart]}
                            locations={[0, 0.18, 0.82, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.line, { top }]}
                        />
                    ))}

                    <TextInput
                        ref={ref}
                        style={[
                            styles.textInput,
                            { color: theme.textColor, fontFamily: SERIF_FONT },
                        ]}
                        placeholder={placeholder}
                        placeholderTextColor={theme.placeholderColor}
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

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        minHeight: TOTAL_HEIGHT,
        position: 'relative',
    },
    line: {
        position: 'absolute',
        left: PADDING_X,
        right: PADDING_X,
        height: StyleSheet.hairlineWidth,
    },
    textInput: {
        paddingTop: TOP_SPACE,
        paddingHorizontal: PADDING_X,
        paddingBottom: PADDING_X,
        fontSize: 17,
        lineHeight: LINE_HEIGHT,
        letterSpacing: 0.1,
        backgroundColor: 'transparent',
        ...Platform.select({
            android: { textAlignVertical: 'top' as const },
        }),
    },
});
