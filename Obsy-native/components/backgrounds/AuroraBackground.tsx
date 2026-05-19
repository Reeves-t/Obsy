import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

// Aurora background — exact 1:1 of the web spec.
// We embed the spec's HTML/CSS verbatim inside a transparent WebView so the
// browser's actual blur(), mix-blend-mode: screen, and radial-gradient stack
// renders pixel-faithfully on iOS / Android.
const AURORA_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; background: transparent; }

  /* Stage / base gradient */
  .bg-stage {
    position: fixed;
    inset: 0;
    min-height: 100vh;
    overflow: hidden;
    isolation: isolate;
    color: #eaeef7;
    background:
      radial-gradient(140% 90% at 50% 110%,
        #0e1530 0%, #070a16 45%, #04060d 100%),
      linear-gradient(180deg, #05070d 0%, #060914 100%);
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

  .bg-streaks .streak {
    position: absolute;
    border-radius: 50%;
    mix-blend-mode: screen;
    will-change: transform, opacity;
  }

  /* Aurora — 4 soft blobs */
  .bg-streaks .s1 {
    top: -10%; left: -10%;
    width: 80%; height: 80%;
    background: radial-gradient(closest-side,
      rgba(17,141,172,.70), rgba(17,141,172,0) 70%);
    filter: blur(90px);
  }
  .bg-streaks .s2 {
    top: 20%; right: -20%;
    width: 90%; height: 90%;
    background: radial-gradient(closest-side,
      rgba(65,96,170,.75), rgba(65,96,170,0) 70%);
    filter: blur(110px);
  }
  .bg-streaks .s3 {
    bottom: -25%; left: 10%;
    width: 70%; height: 70%;
    background: radial-gradient(closest-side,
      rgba(17,141,172,.55), rgba(17,141,172,0) 70%);
    filter: blur(100px);
  }
  .bg-streaks .s4 {
    bottom: 0%; right: 10%;
    width: 55%; height: 55%;
    background: radial-gradient(closest-side,
      rgba(65,96,170,.50), rgba(65,96,170,0) 70%);
    filter: blur(80px);
  }
</style>
</head>
<body>
  <div class="bg-stage">
    <div class="bg-streaks">
      <div class="streak s1"></div>
      <div class="streak s2"></div>
      <div class="streak s3"></div>
      <div class="streak s4"></div>
    </div>
  </div>
</body>
</html>`;

export const AuroraBackground: React.FC = () => {
  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html: AURORA_HTML }}
        style={styles.webview}
        containerStyle={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        javaScriptEnabled={false}
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
    backgroundColor: '#04060d', // Solid fallback while WebView loads
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
