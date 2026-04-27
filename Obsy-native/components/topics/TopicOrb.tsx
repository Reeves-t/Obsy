import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface TopicOrbProps {
    size: number;
    title: string;
    selected?: boolean;
}

export function TopicOrb({ size, title, selected = false }: TopicOrbProps) {
    const fontSize = Math.max(10, Math.min(15, size * 0.155));
    const innerInset = Math.max(2, size * 0.025);

    return (
        <View style={[styles.root, { width: size, height: size }]}>
            {/* Selected halo */}
            {selected && (
                <View style={[styles.halo, {
                    position: 'absolute',
                    top: -size * 0.25,
                    left: -size * 0.25,
                    width: size * 1.5,
                    height: size * 1.5,
                    borderRadius: size * 0.75,
                }]} />
            )}

            {/* Outer metallic ring */}
            <View style={[
                styles.outerRing,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                },
                selected ? styles.selectedShadow : styles.idleShadow,
            ]}>
                <LinearGradient
                    colors={[
                        'rgba(200,200,200,0.45)',
                        'rgba(140,140,140,0.30)',
                        'rgba(90,90,90,0.25)',
                    ]}
                    locations={[0, 0.45, 1]}
                    start={{ x: 0.15, y: 0.08 }}
                    end={{ x: 0.9, y: 0.95 }}
                    style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
                />

                {/* Dark inner inset */}
                <View style={[styles.innerOrb, {
                    top: innerInset,
                    right: innerInset,
                    bottom: innerInset,
                    left: innerInset,
                    borderRadius: (size - innerInset * 2) / 2,
                }]}>
                    <LinearGradient
                        colors={['#242422', '#1A1A18', '#111110']}
                        locations={[0, 0.45, 1]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFillObject}
                    />

                    {/* Top glass shine */}
                    <LinearGradient
                        colors={[
                            'rgba(255,255,255,0.14)',
                            'rgba(255,255,255,0.05)',
                            'transparent',
                        ]}
                        locations={[0, 0.45, 0.75]}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.topHighlight, { height: size * 0.42 }]}
                    />

                    {/* Inner rim */}
                    <View style={styles.innerRim} />
                </View>

                {/* Title text */}
                <Text
                    style={[styles.title, {
                        fontSize,
                        paddingHorizontal: size * 0.14,
                    }]}
                    numberOfLines={3}
                >
                    {title}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    halo: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.24,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 0 },
    },
    outerRing: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedShadow: {
        shadowColor: '#000000',
        shadowOpacity: 0.6,
        shadowRadius: 36,
        shadowOffset: { width: 0, height: 12 },
        elevation: 24,
    },
    idleShadow: {
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 8 },
        elevation: 18,
    },
    innerOrb: {
        position: 'absolute',
        overflow: 'hidden',
    },
    topHighlight: {
        position: 'absolute',
        top: 0,
        left: '8%',
        right: '8%',
        borderBottomLeftRadius: 999,
        borderBottomRightRadius: 999,
    },
    innerRim: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
    },
    title: {
        position: 'absolute',
        color: '#fff',
        fontWeight: '500',
        letterSpacing: 0.1,
        lineHeight: undefined,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        zIndex: 2,
    },
});
