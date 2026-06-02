import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Dimensions,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import Animated, {
    useAnimatedScrollHandler,
    useSharedValue,
} from 'react-native-reanimated';
import type { Topic, TopicStats } from '@/lib/topicStore';
import { MetaPanel } from '@/components/topics/MetaPanel';
import { TopicDiscoverPage } from './TopicDiscoverPage';
import { TopicEvolvePage } from './TopicEvolvePage';
import { PageDots } from './PageDots';

const SCREEN_W = Dimensions.get('window').width;

// All three pages start at the same top inset (header clears the top bar) so
// Observe reads like Discover / Evolve. The big hero orb docks into this region.
const PAGES_TOP = 52;
const PAGE_BOTTOM = 16;

interface TopicFocusPagerProps {
    topic: Topic;
    stats: TopicStats;
    onClose: () => void;
    onAddEntry?: () => void;
    onAskObsy?: () => void;
    onBrowseEntries?: () => void;
}

/**
 * The 3-page horizontal swipe shell for Focus Mode: Observe (MetaPanel),
 * Discover and Evolve. Drives the page-dot indicator.
 */
export function TopicFocusPager({
    topic,
    stats,
    onClose,
    onAddEntry,
    onAskObsy,
    onBrowseEntries,
}: TopicFocusPagerProps) {
    const [size, setSize] = useState({ width: SCREEN_W, height: 0 });
    const [activePage, setActivePage] = useState(0);
    const scrollX = useSharedValue(0);
    const width = size.width || SCREEN_W;

    const scrollHandler = useAnimatedScrollHandler((e) => {
        scrollX.value = e.contentOffset.x;
    });

    const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const p = Math.round(e.nativeEvent.contentOffset.x / width);
        if (p !== activePage) setActivePage(p);
    };

    const onLayout = (e: LayoutChangeEvent) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w !== size.width || h !== size.height) setSize({ width: w, height: h });
    };

    return (
        <View style={styles.container} onLayout={onLayout}>
            {size.height > 0 && (
                <Animated.ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={onMomentumEnd}
                >
                    {/* Page 0 — Observe (existing HUD, embedded) */}
                    <View style={{ width, height: size.height }}>
                        <View style={styles.page0Inner}>
                            <MetaPanel
                                embedded
                                topic={topic}
                                stats={stats}
                                onClose={onClose}
                                onAddEntry={onAddEntry}
                                onAskObsy={onAskObsy}
                                onBrowseEntries={onBrowseEntries}
                            />
                        </View>
                    </View>

                    {/* Page 1 — Discover */}
                    <View style={{ width, height: size.height }}>
                        <TopicDiscoverPage
                            topic={topic}
                            stats={stats}
                            isActive={activePage === 1}
                            onClose={onClose}
                            topInset={PAGES_TOP}
                            bottomInset={PAGE_BOTTOM}
                        />
                    </View>

                    {/* Page 2 — Evolve */}
                    <View style={{ width, height: size.height }}>
                        <TopicEvolvePage
                            topic={topic}
                            stats={stats}
                            isActive={activePage === 2}
                            onClose={onClose}
                            topInset={PAGES_TOP}
                            bottomInset={PAGE_BOTTOM}
                        />
                    </View>
                </Animated.ScrollView>
            )}

            <View style={styles.dots} pointerEvents="none">
                <PageDots scrollX={scrollX} count={3} pageWidth={width} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2,
    },
    page0Inner: {
        flex: 1,
        paddingTop: PAGES_TOP,
        paddingHorizontal: 18,
        paddingBottom: 34, // keep MetaPanel CTAs above the page dots
    },
    dots: {
        position: 'absolute',
        bottom: 12,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
});
