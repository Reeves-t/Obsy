import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuroraPulseStore } from '@/lib/auroraPulseStore';
import {
  AURORA_BACKGROUNDS,
  auroraGradientCss,
  type AuroraBackgroundKey,
} from '@/constants/auroraBackgrounds';
import { ORB_WAVES, type OrbWaveKey } from '@/constants/auroraOrbs';

// Aurora background — 1:1 of the web spec, now a fluid lava-lamp with a
// swappable base color. We embed the spec's HTML/CSS verbatim inside a
// transparent WebView so the browser's actual blur(), mix-blend-mode: screen,
// and radial-gradient stack renders pixel-faithfully on iOS / Android.
//
// Base color: the .bg-stage gradient is driven by a CSS variable (--aurora-bg)
// so switching color is a live setProperty injection — no WebView reload, so the
// orbs keep their momentum. The orbs/blur/blend are never touched by the color.
//
// Motion — a momentum/flick model running inside the WebView (three nested
// layers per orb so transforms compose by nesting):
//   • .orb    — position/size only (static).
//   • .shift  — moved every frame by a requestAnimationFrame loop. Each carousel
//               swipe injects VELOCITY (top orbs down, bottom orbs up, sideways
//               by swipe direction, + randomness); the loop integrates position
//               with damping so the orbs glide fluidly over a wide range, coast
//               well past the button animation, then settle to rest. The loop
//               runs only while there's motion energy and cancels itself once
//               everything settles (no perpetual CPU use).
//   • .streak — the gradient + blur, promoted to its own GPU layer (translateZ)
//               so the blur is rasterized once and only composited/moved.
const buildAuroraHtml = (initialGradient: string, initialOrbA: string, initialOrbB: string) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: transparent; }

  :root { --aurora-bg: ${initialGradient}; --orb-a: ${initialOrbA}; --orb-b: ${initialOrbB}; }

  /* Stage / base gradient (color is swappable via --aurora-bg) */
  .bg-stage {
    position: fixed;
    inset: 0;
    min-height: 100vh;
    overflow: hidden;
    isolation: isolate;
    color: #eaeef7;
    background: var(--aurora-bg);
  }

  /* Vignette */
  .bg-stage::before {
    content: "";
    position: absolute; inset: 0;
    z-index: 2;
    pointer-events: none;
    background: radial-gradient(120% 80% at 50% 50%,
      transparent 55%, rgba(0,0,0,.55) 100%);
  }

  /* Grain */
  .bg-stage::after {
    content: "";
    position: absolute; inset: -2px;
    z-index: 3;
    pointer-events: none;
    opacity: .45;
    mix-blend-mode: overlay;
    background-image: radial-gradient(rgba(255,255,255,.025) 1px, transparent 1px);
    background-size: 3px 3px;
  }

  /* Streaks layer */
  .bg-streaks {
    position: absolute; inset: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0.8;
  }

  /* Outer orb — position/size only */
  .bg-streaks .orb {
    position: absolute;
  }

  /* Shift — moved every frame by the rAF momentum loop */
  .bg-streaks .shift {
    position: absolute;
    inset: 0;
    will-change: transform;
    transform: translate(0%, 0%);
  }

  /* Inner streak — the actual blurred blob, promoted to its own GPU layer */
  .bg-streaks .streak {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    mix-blend-mode: screen;
    will-change: transform;
    transform: translateZ(0);
  }

  /* Aurora — 4 soft blobs (colors are swappable via --orb-a / --orb-b) */
  .bg-streaks .o1 { top: -10%; left: -10%; width: 80%; height: 80%; }
  .bg-streaks .s1 {
    background: radial-gradient(closest-side,
      rgba(var(--orb-a),.70), rgba(var(--orb-a),0) 70%);
    filter: blur(90px);
  }
  .bg-streaks .o2 { top: 20%; right: -20%; width: 90%; height: 90%; }
  .bg-streaks .s2 {
    background: radial-gradient(closest-side,
      rgba(var(--orb-b),.75), rgba(var(--orb-b),0) 70%);
    filter: blur(110px);
  }
  .bg-streaks .o3 { bottom: -25%; left: 10%; width: 70%; height: 70%; }
  .bg-streaks .s3 {
    background: radial-gradient(closest-side,
      rgba(var(--orb-a),.55), rgba(var(--orb-a),0) 70%);
    filter: blur(100px);
  }
  .bg-streaks .o4 { bottom: 0%; right: 10%; width: 55%; height: 55%; }
  .bg-streaks .s4 {
    background: radial-gradient(closest-side,
      rgba(var(--orb-b),.50), rgba(var(--orb-b),0) 70%);
    filter: blur(80px);
  }
</style>
</head>
<body>
  <div class="bg-stage">
    <div class="bg-streaks">
      <div class="orb o1"><div class="shift"><div class="streak s1"></div></div></div>
      <div class="orb o2"><div class="shift"><div class="streak s2"></div></div></div>
      <div class="orb o3"><div class="shift"><div class="streak s3"></div></div></div>
      <div class="orb o4"><div class="shift"><div class="streak s4"></div></div></div>
    </div>
  </div>
  <script>
  (function(){
    var BX = 38, BY = 40;      // soft bounds (% of orb box) — wide roam
    var DAMP = 0.97;           // coast/deceleration per frame (higher = slower, longer glide)
    var STOP = 0.015;          // velocity threshold to settle
    var shifts = null, rafId = null;
    var orbs = [
      { x:0, y:0, vx:0, vy:0, biasY:+1 }, // o1 top    -> down first
      { x:0, y:0, vx:0, vy:0, biasY:+1 }, // o2 top    -> down first
      { x:0, y:0, vx:0, vy:0, biasY:-1 }, // o3 bottom -> up first
      { x:0, y:0, vx:0, vy:0, biasY:-1 }  // o4 bottom -> up first
    ];

    function frame(){
      var moving = false;
      for (var i=0;i<orbs.length;i++){
        var o = orbs[i];
        o.x += o.vx; o.y += o.vy;
        // soft clamp (glide to edge, don't bounce); flip vertical bias at extremes
        if (o.x >  BX){ o.x =  BX; if(o.vx>0) o.vx=0; }
        if (o.x < -BX){ o.x = -BX; if(o.vx<0) o.vx=0; }
        if (o.y >  BY){ o.y =  BY; if(o.vy>0) o.vy=0; o.biasY=-1; }
        if (o.y < -BY){ o.y = -BY; if(o.vy<0) o.vy=0; o.biasY=+1; }
        o.vx *= DAMP; o.vy *= DAMP;
        if (Math.abs(o.vx) > STOP || Math.abs(o.vy) > STOP) moving = true;
        if (shifts && shifts[i]) shifts[i].style.transform =
          'translate(' + o.x.toFixed(2) + '%,' + o.y.toFixed(2) + '%)';
      }
      rafId = moving ? requestAnimationFrame(frame) : null;
    }

    window.auroraKick = function(dir){
      if (!shifts) shifts = document.querySelectorAll('.bg-streaks .shift');
      var ds = (dir === 'left') ? -1 : 1;
      for (var i=0;i<orbs.length;i++){
        var o = orbs[i];
        var mag = 0.9 + Math.random()*0.7;              // glide speed (lower = gentler start)
        o.vy += o.biasY * mag * (0.7 + Math.random()*0.6);
        o.vx += ds * (0.5 + Math.random()*0.7);
        o.vx += (Math.random()-0.5) * 0.8;              // scatter for random placement
        o.vy += (Math.random()-0.5) * 0.8;
      }
      if (rafId === null) rafId = requestAnimationFrame(frame);
    };
  })();
  </script>
</body>
</html>`;

interface AuroraBackgroundProps {
  background?: AuroraBackgroundKey;
  orbWave?: OrbWaveKey;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ background = 'default', orbWave = 'aurora' }) => {
  const webRef = useRef<WebView>(null);
  const pulseId = useAuroraPulseStore((s) => s.pulseId);
  const palette = AURORA_BACKGROUNDS[background] ?? AURORA_BACKGROUNDS.default;
  const wave = ORB_WAVES[orbWave] ?? ORB_WAVES.aurora;

  // Build the HTML once with the initial colors baked in, so source never changes
  // and the WebView never reloads on a color switch.
  const initialBackgroundRef = useRef(background);
  const initialWaveRef = useRef(wave);
  const html = useMemo(
    () => buildAuroraHtml(
      auroraGradientCss(initialBackgroundRef.current),
      initialWaveRef.current.a,
      initialWaveRef.current.b,
    ),
    [],
  );

  // Live base-color swap — no reload, orbs keep their momentum.
  useEffect(() => {
    webRef.current?.injectJavaScript(
      `document.documentElement.style.setProperty('--aurora-bg', '${auroraGradientCss(background)}'); true;`
    );
  }, [background]);

  // Live orb-color swap — no reload, orbs keep their momentum.
  useEffect(() => {
    webRef.current?.injectJavaScript(
      `document.documentElement.style.setProperty('--orb-a', '${wave.a}'); document.documentElement.style.setProperty('--orb-b', '${wave.b}'); true;`
    );
  }, [wave.a, wave.b]);

  // Carousel kick — inject a velocity impulse into the momentum loop.
  useEffect(() => {
    if (pulseId === 0) return; // skip initial mount
    const dir = useAuroraPulseStore.getState().lastDirection;
    webRef.current?.injectJavaScript(`window.auroraKick && window.auroraKick('${dir}'); true;`);
  }, [pulseId]);

  return (
    <View style={[styles.container, { backgroundColor: palette.fallback }]} pointerEvents="none">
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        containerStyle={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        javaScriptEnabled={true}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        cacheEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
