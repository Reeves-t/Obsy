import React from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface FocusCardProps {
    label: string;
    children: React.ReactNode;
    /** Optional refresh affordance shown on the right of the header. */
    onRefresh?: () => void;
    refreshing?: boolean;
    style?: StyleProp<ViewStyle>;
}

function RefreshIcon() {
    return (
        <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <Path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

/**
 * Glass section card for the Discover / Evolve focus pages. Mirrors the
 * `sectionCard` styling used in MetaPanel so the aesthetic stays identical,
 * with an optional refresh button in the header.
 */
export function FocusCard({ label, children, onRefresh, refreshing, style }: FocusCardProps) {
    return (
        <View style={[styles.card, style]}>
            <View style={styles.headerRow}>
                <Text style={styles.label}>{label}</Text>
                {onRefresh && (
                    <Pressable
                        onPress={onRefresh}
                        disabled={refreshing}
                        hitSlop={10}
                        style={styles.refreshBtn}
                        accessibilityLabel={`Refresh ${label}`}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                        ) : (
                            <RefreshIcon />
                        )}
                    </Pressable>
                )}
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        gap: 10,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    label: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1.0,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
    },
    refreshBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
});
