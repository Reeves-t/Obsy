import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useObsyTheme } from "@/contexts/ThemeContext";
import { CalendarDisplayMode } from "@/lib/calendarModeStore";

const MODES: Array<{ mode: CalendarDisplayMode; icon: keyof typeof Ionicons.glyphMap }> = [
    { mode: 'mood', icon: 'color-fill-outline' },
    { mode: 'activity', icon: 'grid-outline' },
    { mode: 'flow', icon: 'reorder-two-outline' },
];

export function CalendarModeToggle({
    mode,
    onChange,
}: {
    mode: CalendarDisplayMode;
    onChange: (mode: CalendarDisplayMode) => void;
}) {
    const { colors, isLight } = useObsyTheme();

    return (
        <View
            style={[
                styles.pill,
                {
                    backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                    borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
                },
            ]}
        >
            {MODES.map(({ mode: m, icon }) => {
                const active = m === mode;
                return (
                    <Pressable
                        key={m}
                        onPress={() => {
                            if (m === mode) return;
                            Haptics.selectionAsync();
                            onChange(m);
                        }}
                        hitSlop={6}
                        style={[
                            styles.segment,
                            active && {
                                backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                            },
                        ]}
                    >
                        <Ionicons
                            name={icon}
                            size={15}
                            color={active ? colors.text : colors.textTertiary}
                        />
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        borderRadius: 999,
        borderWidth: 1,
        padding: 2,
        gap: 2,
    },
    segment: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
});
