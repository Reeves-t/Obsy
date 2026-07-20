import { makeMutable } from 'react-native-reanimated';

// UI-thread bridge between the home action carousel and the Aurora shader
// background. The carousel physics loop writes these every frame; the shader's
// uniforms read them every frame. Both live on the UI thread, so the
// background swirls in perfect sync with the dial — no events, no bridge hops.
//
// This replaces the old `auroraPulseStore` + WebView `injectJavaScript` kick
// (a discrete impulse per 90° step). Coupling is now continuous: slow drags
// drift the aurora slowly, hard flings and turbo visibly whip it.
export const auroraFlow = {
  /** Carousel display rotation (radians, unbounded/accumulated). */
  theta: makeMutable(0),
  /** |angular velocity| in rad/s (0 when idle, ~14 fling cap, 20+ in turbo). */
  energy: makeMutable(0),
};
