import React from 'react';
import { StyleSheet, View } from 'react-native';

const RING_SIZE = 168;

interface FocusRingProps {
    active: boolean;
    children?: React.ReactNode;
}

export function FocusRing({ active, children }: FocusRingProps) {
    return (
        <View style={styles.container}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
