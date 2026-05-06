// InsightCardSurface.tsx
// Gradient-black metallic background card for insight sections.
// Drop the insight content as children.

import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

export function InsightCardSurface({ children, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      {/* base gradient: graphite top → black bottom */}
      <LinearGradient
        colors={["#1d1d20", "#141416", "#08080a", "#000000"]}
        locations={[0, 0.35, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* top inner highlight — adds the "metal lip" feel */}
      <LinearGradient
        colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0)"]}
        locations={[0, 0.5]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* 1px bright top edge */}
      <View style={styles.topHairline} pointerEvents="none" />

      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#0a0a0c", // fallback under gradients
    // iOS shadow
    shadowColor: "#000",
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    // Android
    elevation: 10,
  },
  topHairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  inner: {
    // Cards handle their own internal padding
  },
});
