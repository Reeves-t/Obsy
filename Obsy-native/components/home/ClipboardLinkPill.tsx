/**
 * ClipboardLinkPill — the fallback capture path for apps that fight share sheets.
 *
 * Instagram in particular pushes people toward "Copy link" rather than sharing,
 * so a meaningful share of saves never reach the share extension. On foreground
 * this offers to save whatever link is on the clipboard.
 *
 * PRIVACY, and the reason this is shaped oddly on iOS: reading the clipboard
 * fires the system "pasted from" banner, which feels like snooping when the user
 * did not ask for anything. So iOS only ever asks `hasUrlAsync()` — a presence
 * check that does NOT read the contents and does NOT trigger the banner — and
 * the contents are read only after the user taps the offer. Android has no such
 * banner, so it reads up front and can filter to known platforms before
 * bothering anyone.
 *
 * Nothing is ever saved automatically; the pill is an offer, always one tap.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, AppState, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import {
    isValidShareUrl,
    detectPlatform,
    platformToColor,
} from '@/services/sharedLinkService';

/** Remembers the last link we already offered, so it is not re-offered forever. */
const LAST_OFFERED_KEY = 'obsy:clipboard:last-offered';

/** Cheap stable key for a URL — only used to avoid repeating an offer. */
function urlKey(url: string): string {
    return url.slice(0, 200);
}

/** True when the URL belongs to a platform Obsy actually renders a card for. */
function isInterestingLink(url: string): boolean {
    return isValidShareUrl(url) && detectPlatform(url) !== 'Web';
}

export function ClipboardLinkPill() {
    const router = useRouter();
    const { colors, isLight } = useObsyTheme();

    const [visible, setVisible] = useState(false);
    /** Android reads up front, so it can show which platform is on offer. */
    const [knownUrl, setKnownUrl] = useState<string | null>(null);
    const dismissedThisForeground = useRef(false);

    const check = useCallback(async () => {
        if (dismissedThisForeground.current) return;

        try {
            if (Platform.OS === 'android') {
                const text = await Clipboard.getStringAsync();
                if (!text || !isInterestingLink(text)) return;

                const seen = await AsyncStorage.getItem(LAST_OFFERED_KEY);
                if (seen === urlKey(text)) return;

                setKnownUrl(text);
                setVisible(true);
                return;
            }

            // iOS: presence only — reading here would fire the paste banner.
            const hasUrl = await Clipboard.hasUrlAsync();
            if (hasUrl) {
                setKnownUrl(null);
                setVisible(true);
            }
        } catch {
            // Clipboard access can fail benignly (permissions, simulator quirks).
        }
    }, []);

    useEffect(() => {
        check();

        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') {
                dismissedThisForeground.current = false;
                check();
            }
        });
        return () => sub.remove();
    }, [check]);

    const handleDismiss = useCallback(() => {
        dismissedThisForeground.current = true;
        setVisible(false);
    }, []);

    const handleAccept = useCallback(async () => {
        setVisible(false);
        try {
            // On iOS this is the first actual read, and it happens only because
            // the user just asked for it — so the paste banner is expected here.
            const url = knownUrl ?? await Clipboard.getUrlAsync() ?? await Clipboard.getStringAsync();
            if (!url || !isValidShareUrl(url)) return;

            await AsyncStorage.setItem(LAST_OFFERED_KEY, urlKey(url));
            router.push({ pathname: '/share', params: { url } });
        } catch {
            // Nothing to offer; staying silent beats an error toast here.
        }
    }, [knownUrl, router]);

    if (!visible) return null;

    const accent = knownUrl ? platformToColor(detectPlatform(knownUrl)) : colors.text;

    return (
        <Animated.View
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
            style={styles.wrapper}
        >
            <View
                style={[
                    styles.pill,
                    {
                        backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                        borderColor: colors.cardBorder,
                    },
                ]}
            >
                <TouchableOpacity style={styles.main} activeOpacity={0.85} onPress={handleAccept}>
                    <Ionicons name="link" size={15} color={accent} />
                    <ThemedText numberOfLines={1} style={[styles.label, { color: colors.text }]}>
                        Save the link you copied?
                    </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleDismiss} hitSlop={10} style={styles.close}>
                    <Ionicons name="close" size={15} color={colors.textTertiary} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 8,
        paddingVertical: 9,
        borderRadius: 22,
        borderWidth: 1,
        maxWidth: '88%',
        gap: 4,
    },
    main: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
    close: {
        padding: 4,
    },
});
