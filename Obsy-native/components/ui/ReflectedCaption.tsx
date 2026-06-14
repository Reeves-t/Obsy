import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

interface ReflectedCaptionProps {
  text: string;
  textStyle: StyleProp<TextStyle>;
  /** Color for the mirrored reflection (e.g. the theme accent `rgb(r,g,b)`). */
  reflectionColor: string;
}

// The caption text plus an upside-down mirror of it, attached at the baseline
// and fading out downward via a gradient mask — a reflection on a glossy floor.
// The vertical flip (scaleY: -1) reverses line order, so the reflection's TOP
// line is the mirror of the text's BOTTOM line — which keeps it aligned under
// multi-line captions instead of dropping a detached copy below the block.
export function ReflectedCaption({ text, textStyle, reflectionColor }: ReflectedCaptionProps) {
  const flat = StyleSheet.flatten(textStyle) || {};
  const fontSize = Number(flat.fontSize) || 18;
  const lineHeight = Number(flat.lineHeight) || Math.round(fontSize * 1.35);
  // Pull the mirror up by the line's leading so its glyphs meet the real ones.
  const overlap = Math.max(0, lineHeight - fontSize) + 2;
  const reflectionHeight = Math.round(lineHeight * 2.3);

  return (
    <View style={styles.wrap}>
      <Text style={[textStyle, styles.noPad]}>{text}</Text>

      <MaskedView
        style={[styles.maskWrap, { height: reflectionHeight, marginTop: -overlap }]}
        maskElement={
          <LinearGradient
            colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0)']}
            locations={[0, 0.7]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <Text numberOfLines={2} style={[textStyle, styles.noPad, styles.mirror, { color: reflectionColor }]}>
          {text}
        </Text>
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  noPad: {
    includeFontPadding: false,
  },
  maskWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  mirror: {
    transform: [{ scaleY: -1 }],
    opacity: 0.45,
  },
});
