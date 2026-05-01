import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface CTAOrbShellProps {
  size: number;
  dim?: boolean;
  children: React.ReactNode;
}

const RING_PADDING = 8;

export function CTAOrbShell({ size, dim = false, children }: CTAOrbShellProps) {
  const ringSize = size + RING_PADDING;
  const innerInset = Math.max(2, size * 0.025);

  return (
    <View
      style={[
        styles.shell,
        dim ? styles.dimShell : styles.fullShell,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
        },
      ]}
    >
      <LinearGradient
        colors={[
          'rgba(230,230,230,0.60)',
          'rgba(180,180,180,0.44)',
          'rgba(140,140,140,0.36)',
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.15, y: 0.08 }}
        end={{ x: 0.9, y: 0.95 }}
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: ringSize / 2,
          },
        ]}
      />

      <View
        style={[
          styles.innerOrb,
          {
            top: innerInset,
            right: innerInset,
            bottom: innerInset,
            left: innerInset,
            borderRadius: (ringSize - innerInset * 2) / 2,
          },
        ]}
      >
        <LinearGradient
          colors={['#242422', '#1A1A18', '#111110']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.innerRim} />
        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullShell: {
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  dimShell: {
    opacity: 0.88,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  innerOrb: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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
  content: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
