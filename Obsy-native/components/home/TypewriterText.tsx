import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

interface TypewriterTextProps {
  messages: string[];
  style?: StyleProp<TextStyle>;
  caretColor?: string;
  holdMs?: number;
  minHeight?: number;
}

type Phase = 'typing' | 'hold' | 'deleting';

/**
 * Rotating type/hold/delete line with a blinking caret, ported from the
 * Control home design's twStep state machine.
 */
export function TypewriterText({
  messages,
  style,
  caretColor = '#41caec',
  holdMs = 5000,
  minHeight = 42,
}: TypewriterTextProps) {
  const isFocused = useIsFocused();
  const [typed, setTyped] = useState(messages[0] ?? '');
  const tw = useRef({ mi: 0, ci: (messages[0] ?? '').length, phase: 'hold' as Phase });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const caretOpacity = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) {
      cancelAnimation(caretOpacity);
      return;
    }
    caretOpacity.value = withRepeat(withTiming(0.15, { duration: 480 }), -1, true);
    return () => cancelAnimation(caretOpacity);
  }, [isFocused, caretOpacity]);

  useEffect(() => {
    if (!isFocused || messages.length === 0) return;

    const step = () => {
      const { mi, ci, phase } = tw.current;
      let nextMi = mi;
      let nextCi = ci;
      let nextPhase = phase;
      let delay = 38;

      if (phase === 'typing') {
        nextCi = ci + 1;
        if (nextCi >= messages[mi].length) {
          nextCi = messages[mi].length;
          nextPhase = 'hold';
          delay = holdMs;
        } else {
          delay = 30 + Math.random() * 45;
        }
      } else if (phase === 'hold') {
        nextPhase = 'deleting';
        delay = 24;
      } else {
        nextCi = ci - 1;
        if (nextCi <= 0) {
          nextCi = 0;
          nextMi = (mi + 1) % messages.length;
          nextPhase = 'typing';
          delay = 180;
        } else {
          delay = 16;
        }
      }

      tw.current = { mi: nextMi, ci: nextCi, phase: nextPhase };
      setTyped(messages[nextMi].slice(0, nextCi));
      timer.current = setTimeout(step, delay);
    };

    timer.current = setTimeout(step, tw.current.phase === 'hold' ? holdMs : 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isFocused, messages, holdMs]);

  const caretStyle = useAnimatedStyle(() => ({
    opacity: caretOpacity.value,
  }));

  return (
    <View style={[styles.container, { minHeight }]}>
      <Text style={style}>
        {typed}
        <View style={styles.caretSlot}>
          <Animated.View style={[styles.caret, { backgroundColor: caretColor }, caretStyle]} />
        </View>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'flex-start',
  },
  caretSlot: {
    width: 4,
    height: 15,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  caret: {
    width: 2,
    height: 15,
    borderRadius: 1,
  },
});
