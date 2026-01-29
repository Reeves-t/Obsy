import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    withSequence,
    withDelay,
    FadeIn,
    SlideInDown
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');
const SHEET_HEIGHT = height * 0.85; // ~85% of screen height
const SHEET_BORDER_RADIUS = 34;

// Ambient glow orbs (matching AmbientBackground)
const GLOW_ORBS = [
    { id: 'top-left', color: '#FB923C4D', position: { top: -60, left: -60 }, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    { id: 'top-right', color: '#60A5FA4D', position: { top: -60, right: -60 }, start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
    { id: 'bottom-left', color: '#34D3994D', position: { bottom: -60, left: -60 }, start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
    { id: 'bottom-right', color: '#A78BFA4D', position: { bottom: -60, right: -60 }, start: { x: 1, y: 1 }, end: { x: 0, y: 0 } },
] as const;

// --- Subtle Shimmer for premium elements ---
const SubtleShimmer = ({ children, style, intensity = 0.3 }: { children: React.ReactNode, style?: any, intensity?: number }) => {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
                withDelay(2000, withTiming(0, { duration: 0 }))
            ),
            -1,
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: -width + (progress.value * (width * 2.5)) }],
    }));

    return (
        <View style={[{ overflow: 'hidden' }, style]}>
            {children}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: intensity }, animatedStyle]} pointerEvents="none">
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.4)', 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </View>
    );
};

interface VanguardPaywallProps {
    visible: boolean;
    onClose: () => void;
    featureName?: string;
}

// Price display strings (matching existing product values)
const PLAN_PRICES = {
    founder: '$29.99 / lifetime',
    yearly: '$18.99 / year',
    monthly: '$1.99 / month',
} as const;

// Plus features list
const PREMIUM_FEATURES = [
    { icon: 'bulb-outline' as const, title: 'Unlimited Insights', subtitle: 'Generate insights without limits.' },
    { icon: 'archive-outline' as const, title: 'Insight Archives', subtitle: 'Access and revisit all past insights anytime.' },
    { icon: 'color-palette-outline' as const, title: 'All AI Tones', subtitle: 'Unlock every AI tone and style.' },
];

export function VanguardPaywall({ visible, onClose, featureName }: VanguardPaywallProps) {
    const insets = useSafeAreaInsets();
    const [founderCount, setFounderCount] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState<'founder' | 'yearly' | 'monthly'>('founder');

    useEffect(() => {
        if (visible) {
            fetchFounderCount();
        }
    }, [visible]);

    const fetchFounderCount = async () => {
        const { data } = await supabase
            .from('system_stats')
            .select('value')
            .eq('key', 'founder_count')
            .single();

        if (data && data.value) {
            // @ts-ignore
            setFounderCount(data.value.count || 423);
        } else {
            setFounderCount(423);
        }
    };

    const handlePurchase = async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log(`Purchasing ${selectedPlan}`);
        onClose();
    };

    // CTA button label based on selection
    const ctaLabel = selectedPlan === 'founder' ? 'Become a Founder' : 'Become a Plus member';
    // Price text below CTA
    const priceLabel = PLAN_PRICES[selectedPlan];

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.modalContainer}>
                {/* Background layer - matches app home screen */}
                <View style={StyleSheet.absoluteFill}>
                    {/* Black base */}
                    <View style={styles.blackBase} />
                    {/* Corner glow orbs */}
                    {GLOW_ORBS.map((orb) => (
                        <View key={orb.id} style={[styles.orbContainer, orb.position]}>
                            <LinearGradient
                                colors={[orb.color, 'transparent']}
                                style={styles.orb}
                                start={orb.start}
                                end={orb.end}
                            />
                        </View>
                    ))}
                </View>

                {/* Blur overlay behind sheet */}
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                {/* Tap outside to close */}
                <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

                {/* Bottom Sheet */}
                <Animated.View
                    entering={SlideInDown.springify().damping(20).stiffness(90)}
                    style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
                >
                    {/* Sheet glass background */}
                    <View style={styles.sheetGlass}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                            style={StyleSheet.absoluteFill}
                        />
                    </View>

                    {/* Handle indicator */}
                    <View style={styles.handleContainer}>
                        <View style={styles.handle} />
                    </View>

                    {/* Close Button */}
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <View style={styles.closeButtonBg}>
                            <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
                        </View>
                    </TouchableOpacity>

                    {/* Scrollable Content */}
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        bounces={true}
                    >
                        {/* --- FOUNDER'S PASS SELECTABLE CARD --- */}
                        <TouchableOpacity
                            style={styles.founderCardTouchable}
                            activeOpacity={0.8}
                            onPress={() => {
                                setSelectedPlan('founder');
                                Haptics.selectionAsync();
                            }}
                        >
                            <View style={[
                                styles.founderCard,
                                selectedPlan === 'founder' && styles.founderCardSelected
                            ]}>
                                {/* Glass background with purple selection tint */}
                                <LinearGradient
                                    colors={selectedPlan === 'founder'
                                        ? ['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.04)']
                                        : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
                                    style={StyleSheet.absoluteFill}
                                />
                                {selectedPlan === 'founder' && (
                                    <View style={styles.founderSelectedGlow} />
                                )}

                                {/* Limited Edition Badge - premium, minimal */}
                                <View style={styles.limitedBadge}>
                                    <LinearGradient
                                        colors={['rgba(251,191,36,0.15)', 'rgba(251,191,36,0.05)']}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <Text style={styles.limitedText}>LIMITED EDITION</Text>
                                </View>

                                <SubtleShimmer style={styles.heroTitleContainer} intensity={0.2}>
                                    <Text style={styles.heroTitle}>THE FOUNDER'S PASS</Text>
                                </SubtleShimmer>

                                {/* Scarcity / Progress */}
                                <View style={styles.scarcitySection}>
                                    <Text style={styles.scarcityText}>{founderCount} / 1,000 CLAIMED</Text>
                                    <View style={styles.progressBarBg}>
                                        <LinearGradient
                                            colors={['#fbbf24', '#f59e0b']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={[styles.progressBarFill, { width: `${(founderCount / 1000) * 100}%` }]}
                                        />
                                        {/* Soft glow on progress */}
                                        <View style={[styles.progressGlow, { width: `${(founderCount / 1000) * 100}%` }]} />
                                    </View>
                                </View>

                                {/* Benefits List */}
                                <View style={styles.benefitsList}>
                                    <View style={styles.benefitItem}>
                                        <View style={styles.benefitIconContainer}>
                                            <Ionicons name="trophy" size={14} color="#fbbf24" />
                                        </View>
                                        <Text style={styles.benefitText}>
                                            <Text style={styles.benefitHighlight}>LIFETIME ACCESS TO ALL FEATURES</Text> (One-time payment $29.99)
                                        </Text>
                                    </View>
                                    <View style={styles.benefitItem}>
                                        <View style={styles.benefitIconContainer}>
                                            <Ionicons name="infinite" size={14} color="#fbbf24" />
                                        </View>
                                        <Text style={styles.benefitText}>
                                            <Text style={styles.benefitHighlight}>UNLIMITED INSIGHTS</Text> (Daily, Weekly, Monthly)
                                        </Text>
                                    </View>
                                    <View style={styles.benefitItem}>
                                        <View style={styles.benefitIconContainer}>
                                            <Ionicons name="color-palette" size={14} color="#fbbf24" />
                                        </View>
                                        <Text style={styles.benefitText}>
                                            <Text style={styles.benefitHighlight}>ALL AI TONES</Text> (Including Custom Tones)
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.divider} />

                        {/* --- STANDARD SUBSCRIPTION --- */}
                        <View style={styles.standardSection}>
                            <Text style={styles.sectionLabel}>OBSY PLUS SUBSCRIPTION</Text>

                            {/* Plus Features List */}
                            <View style={styles.premiumFeaturesList}>
                                {PREMIUM_FEATURES.map((feature, index) => (
                                    <View key={index} style={styles.premiumFeatureItem}>
                                        <View style={styles.premiumFeatureIcon}>
                                            <Ionicons name={feature.icon} size={18} color="rgba(255,255,255,0.7)" />
                                        </View>
                                        <View style={styles.premiumFeatureText}>
                                            <Text style={styles.premiumFeatureTitle}>{feature.title}</Text>
                                            <Text style={styles.premiumFeatureSubtitle}>{feature.subtitle}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            <View style={styles.plansRow}>
                                {/* YEARLY PLAN */}
                                <TouchableOpacity
                                    style={styles.planTouchable}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        setSelectedPlan('yearly');
                                        Haptics.selectionAsync();
                                    }}
                                >
                                    <View style={[
                                        styles.planCard,
                                        selectedPlan === 'yearly' && styles.planCardSelectedYearly
                                    ]}>
                                        {/* Glass background with orange selection tint */}
                                        <LinearGradient
                                            colors={selectedPlan === 'yearly'
                                                ? ['rgba(251,191,36,0.12)', 'rgba(251,191,36,0.04)']
                                                : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
                                            style={StyleSheet.absoluteFill}
                                        />
                                        {selectedPlan === 'yearly' && (
                                            <View style={styles.selectedGlowYearly} />
                                        )}
                                        <View style={styles.saveBadge}>
                                            <Text style={styles.saveText}>SAVE 20%</Text>
                                        </View>
                                        <Text style={styles.planName}>YEARLY</Text>
                                        <Text style={styles.planPrice}>$18.99 / YR</Text>
                                    </View>
                                </TouchableOpacity>

                                <View style={{ width: 14 }} />

                                {/* MONTHLY PLAN */}
                                <TouchableOpacity
                                    style={styles.planTouchable}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        setSelectedPlan('monthly');
                                        Haptics.selectionAsync();
                                    }}
                                >
                                    <View style={[
                                        styles.planCard,
                                        selectedPlan === 'monthly' && styles.planCardSelectedMonthly
                                    ]}>
                                        {/* Glass background with green selection tint */}
                                        <LinearGradient
                                            colors={selectedPlan === 'monthly'
                                                ? ['rgba(74,222,128,0.12)', 'rgba(74,222,128,0.04)']
                                                : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
                                            style={StyleSheet.absoluteFill}
                                        />
                                        {selectedPlan === 'monthly' && (
                                            <View style={styles.selectedGlowMonthly} />
                                        )}
                                        <Text style={styles.planName}>MONTHLY</Text>
                                        <Text style={styles.planPrice}>$1.99 / MO</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>

                    {/* --- STICKY CTA FOOTER --- */}
                    <View style={styles.ctaContainer}>
                        {/* Fade gradient above CTA */}
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.8)']}
                            style={styles.ctaFade}
                            pointerEvents="none"
                        />
                        <TouchableOpacity style={styles.submitButton} onPress={handlePurchase} activeOpacity={0.9}>
                            <LinearGradient
                                colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.85)']}
                                style={StyleSheet.absoluteFill}
                            />
                            {/* Subtle shine */}
                            <View style={styles.buttonShine} />
                            <Text style={styles.submitText}>{ctaLabel}</Text>
                        </TouchableOpacity>
                        <Text style={styles.priceText}>{priceLabel}</Text>
                        <Text style={styles.cancelText}>Cancel anytime in the App Store</Text>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    // Modal & Background
    modalContainer: {
        flex: 1,
    },
    blackBase: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    orbContainer: {
        position: 'absolute',
        width: 180,
        height: 180,
    },
    orb: {
        width: 180,
        height: 180,
        borderRadius: 90,
    },
    dismissArea: {
        flex: 1,
    },

    // Bottom Sheet
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SHEET_HEIGHT,
        borderTopLeftRadius: SHEET_BORDER_RADIUS,
        borderTopRightRadius: SHEET_BORDER_RADIUS,
        overflow: 'hidden',
    },
    sheetGlass: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderTopLeftRadius: SHEET_BORDER_RADIUS,
        borderTopRightRadius: SHEET_BORDER_RADIUS,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    handleContainer: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 50,
    },
    closeButtonBg: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Scrollable Content
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 140, // Space for sticky CTA
    },

    // Founder's Pass Card (selectable like other plans)
    founderCardTouchable: {
        width: '100%',
    },
    founderCard: {
        width: '100%',
        borderRadius: 28,
        paddingVertical: 28,
        paddingHorizontal: 20,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    founderCardSelected: {
        borderColor: 'rgba(139,92,246,0.4)',
    },
    founderSelectedGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40%',
        backgroundColor: 'rgba(139,92,246,0.08)',
    },
    limitedBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(251,191,36,0.2)',
    },
    limitedText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fbbf24',
        letterSpacing: 1.5,
    },
    heroTitleContainer: {
        marginBottom: 20,
    },
    heroTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: 'white',
        letterSpacing: 1.5,
        textAlign: 'center',
        textShadowColor: 'rgba(251, 191, 36, 0.25)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    scarcitySection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 28,
    },
    scarcityText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginBottom: 10,
        fontWeight: '600',
        letterSpacing: 1,
    },
    progressBarBg: {
        width: '55%',
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressGlow: {
        position: 'absolute',
        top: -2,
        left: 0,
        height: 8,
        backgroundColor: 'rgba(251,191,36,0.3)',
        borderRadius: 4,
    },
    benefitsList: {
        width: '100%',
        gap: 14,
    },
    benefitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        gap: 12,
    },
    benefitIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    benefitText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: '500',
        flex: 1,
    },
    benefitHighlight: {
        color: 'white',
        fontWeight: '700',
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 28,
    },

    // Standard Section
    standardSection: {
        marginBottom: 24,
    },
    sectionLabel: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 20,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    // Plus Features List
    premiumFeaturesList: {
        marginBottom: 24,
        gap: 16,
    },
    premiumFeatureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    premiumFeatureIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    premiumFeatureText: {
        flex: 1,
    },
    premiumFeatureTitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    premiumFeatureSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        lineHeight: 16,
    },

    plansRow: {
        flexDirection: 'row',
    },
    planTouchable: {
        flex: 1,
    },
    planCard: {
        height: 100,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    planCardSelectedYearly: {
        borderColor: 'rgba(251,191,36,0.4)',
        transform: [{ scale: 1.02 }],
    },
    planCardSelectedMonthly: {
        borderColor: 'rgba(74,222,128,0.4)',
        transform: [{ scale: 1.02 }],
    },
    selectedGlowYearly: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '50%',
        backgroundColor: 'rgba(251,191,36,0.08)',
    },
    selectedGlowMonthly: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '50%',
        backgroundColor: 'rgba(74,222,128,0.08)',
    },
    saveBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(251,191,36,0.9)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    saveText: {
        color: 'black',
        fontSize: 9,
        fontWeight: '800',
    },
    planName: {
        color: 'white',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    planPrice: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontWeight: '500',
    },

    // CTA Footer
    ctaContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 8,
    },
    ctaFade: {
        position: 'absolute',
        top: -40,
        left: 0,
        right: 0,
        height: 60,
    },
    submitButton: {
        width: '100%',
        paddingVertical: 18,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        overflow: 'hidden',
        shadowColor: 'rgba(255,255,255,0.5)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 8,
    },
    buttonShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '45%',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    submitText: {
        color: 'black',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 1,
    },
    priceText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 10,
    },
    cancelText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 6,
    },
});
