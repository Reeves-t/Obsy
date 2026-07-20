import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { auroraFlow } from '@/lib/auroraFlow';

// Physics for the orbital CTA carousel, ported from the design handoff at
// `claude design/Carousel slider with orbital buttons/design_handoff_orbital_carousel/`.
// One shared rotation value `theta` drives all four buttons; button i sits at
// angle `theta + i * HALF`. The whole state machine runs on the UI thread via
// useFrameCallback — gestures feed it through the worklet helpers returned here.

export const HALF = Math.PI / 2;
export const FRONT = Math.PI / 2;
export const TAU = Math.PI * 2;
export const ACTION_COUNT = 4;

// ── Tunables (design defaults from the handoff) ──────────────────────
export const BOUNCE = 0.6; // 0–1, spring softness; higher = bouncier snap
export const SLIDER_SENSITIVITY = 0.016; // rad per px of horizontal drag
export const SWAY_ENABLED = true; // idle ambient sway

const MAX_RELEASE_VELOCITY = 14; // rad/s
const FLING_ENTER_VELOCITY = 1.6; // rad/s — below this a release springs directly
const FLING_DECAY = 2.6; // exponential decay rate while flinging
const RELEASE_TARGET_NUDGE = 0.12; // seconds of residual velocity folded into the detent pick
const SPRING_K = 130;
const SETTLE_ANGLE = 0.004; // rad
const SETTLE_VELOCITY = 0.06; // rad/s

const TURBO_WINDOW_MS = 4000;
const TURBO_REVS = 7;
const TURBO_MIN_VELOCITY = 20; // rad/s punch when turbo kicks in
const TURBO_BOOST = 1.35;
const TURBO_DECAY = 0.5; // slower than fling so it visibly sustains
const TURBO_EXIT_VELOCITY = 3; // rad/s
const TURBO_DURATION_MIN_MS = 3200;
const TURBO_DURATION_RAND_MS = 900;
export const TURBO_PHRASE_INTERVAL_S = 0.85;

export type OrbitPhase = 'idle' | 'drag' | 'fling' | 'spring' | 'turbo';
export type SpinDirection = 'left' | 'right';

export function normAngle(a: number): number {
  'worklet';
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export function nearestDetent(a: number): number {
  'worklet';
  return Math.round(a / HALF) * HALF;
}

export function activeIndexFor(theta: number): number {
  'worklet';
  return ((Math.round((FRONT - theta) / HALF) % ACTION_COUNT) + ACTION_COUNT) % ACTION_COUNT;
}

export interface OrbitPhysicsCallbacks {
  // Fired every time a new button crosses into the front slot (each 90° detent
  // crossing), even mid-fling/turbo. `direction` matches the user's swipe.
  onIndexChange: (index: number, direction: SpinDirection) => void;
  // Fired when the spring settles onto a detent — pop-bounce + particle burst.
  onSettle: (index: number) => void;
  onTurboStart: () => void;
  onTurboPhrase: (phraseIndex: number) => void;
  // Fired when turbo hands control back (decay finished or user grabbed it).
  onTurboEnd: () => void;
}

export interface OrbitPhysics {
  theta: SharedValue<number>;
  thetaDisplay: SharedValue<number>;
  vel: SharedValue<number>;
  phase: SharedValue<OrbitPhase>;
  settlePulse: SharedValue<number>;
  // Worklet helpers — call from gesture callbacks (or via runOnUI from JS).
  beginDrag: () => void;
  dragBy: (dxPx: number) => void;
  endDrag: (velocityXPx: number) => void;
  spinTo: (index: number) => void;
}

export function useOrbitPhysics(
  initialIndex: number,
  callbacks: OrbitPhysicsCallbacks
): OrbitPhysics {
  const theta = useSharedValue(FRONT - initialIndex * HALF);
  const thetaDisplay = useSharedValue(FRONT - initialIndex * HALF);
  const vel = useSharedValue(0);
  const phase = useSharedValue<OrbitPhase>('idle');
  const target = useSharedValue(FRONT - initialIndex * HALF);
  const settlePulse = useSharedValue(0);

  const activeIdx = useSharedValue(initialIndex);
  const lastTheta = useSharedValue(FRONT - initialIndex * HALF);
  // Frame-loop clock (ms). Gesture worklets read this so the turbo rotation
  // buffer stays on one time base (gesture events carry no usable timestamp).
  const clock = useSharedValue(0);

  // Rolling window of |Δtheta| samples for the turbo easter egg. The arrays
  // live inside one shared value and are mutated in place on the UI thread —
  // no reactivity needed, just persistence.
  const rotBuf = useSharedValue<{ t: number[]; d: number[] }>({ t: [], d: [] });
  const turboEnd = useSharedValue(0);
  const turboPhraseT = useSharedValue(0);
  const turboPhraseIdx = useSharedValue(0);

  const { onIndexChange, onSettle, onTurboStart, onTurboPhrase, onTurboEnd } = callbacks;

  const addRot = (now: number, d: number) => {
    'worklet';
    rotBuf.modify((buf) => {
      'worklet';
      buf.t.push(now);
      buf.d.push(Math.abs(d));
      while (buf.t.length > 0 && now - buf.t[0] > TURBO_WINDOW_MS) {
        buf.t.shift();
        buf.d.shift();
      }
      return buf;
    });
  };

  const revsInWindow = () => {
    'worklet';
    const buf = rotBuf.value;
    let sum = 0;
    for (let i = 0; i < buf.d.length; i++) sum += buf.d[i];
    return sum / TAU;
  };

  const clearRotBuf = () => {
    'worklet';
    rotBuf.modify((buf) => {
      'worklet';
      buf.t.length = 0;
      buf.d.length = 0;
      return buf;
    });
  };

  const cancelTurbo = () => {
    'worklet';
    if (phase.value !== 'turbo') return;
    clearRotBuf();
    runOnJS(onTurboEnd)();
  };

  const beginDrag = () => {
    'worklet';
    cancelTurbo();
    phase.value = 'drag';
    vel.value = 0;
  };

  const dragBy = (dxPx: number) => {
    'worklet';
    if (phase.value !== 'drag') return;
    const da = -dxPx * SLIDER_SENSITIVITY;
    theta.value += da;
    addRot(clock.value, da);
  };

  const endDrag = (velocityXPx: number) => {
    'worklet';
    if (phase.value !== 'drag') return;
    // A pure tap can finalize without ever activating — treat as zero velocity.
    const vPx = velocityXPx || 0;
    const v = Math.max(
      -MAX_RELEASE_VELOCITY,
      Math.min(MAX_RELEASE_VELOCITY, -vPx * SLIDER_SENSITIVITY)
    );
    vel.value = v;
    if (Math.abs(v) > FLING_ENTER_VELOCITY) {
      phase.value = 'fling';
    } else {
      target.value = nearestDetent(theta.value + v * RELEASE_TARGET_NUDGE);
      phase.value = 'spring';
    }
  };

  const spinTo = (index: number) => {
    'worklet';
    cancelTurbo();
    const want = FRONT - index * HALF;
    const delta = normAngle(want - theta.value);
    if (Math.abs(delta) < 0.001 && phase.value === 'idle') return;
    target.value = theta.value + delta;
    phase.value = 'spring';
  };

  useFrameCallback((info) => {
    const now = info.timestamp;
    clock.value = now;
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16.7) / 1000);

    if (phase.value === 'fling') {
      const d = vel.value * dt;
      theta.value += d;
      addRot(now, d);
      vel.value *= Math.exp(-FLING_DECAY * dt);
      if (revsInWindow() >= TURBO_REVS) {
        vel.value =
          (vel.value >= 0 ? 1 : -1) *
          Math.max(TURBO_MIN_VELOCITY, Math.abs(vel.value) * TURBO_BOOST);
        turboEnd.value = now + TURBO_DURATION_MIN_MS + Math.random() * TURBO_DURATION_RAND_MS;
        // Prime so the first witty phrase lands almost immediately.
        turboPhraseT.value = TURBO_PHRASE_INTERVAL_S;
        phase.value = 'turbo';
        runOnJS(onTurboStart)();
      } else if (Math.abs(vel.value) < FLING_ENTER_VELOCITY) {
        target.value = nearestDetent(theta.value + vel.value * RELEASE_TARGET_NUDGE);
        phase.value = 'spring';
      }
    } else if (phase.value === 'turbo') {
      theta.value += vel.value * dt;
      vel.value *= Math.exp(-TURBO_DECAY * dt);
      turboPhraseT.value += dt;
      if (turboPhraseT.value >= TURBO_PHRASE_INTERVAL_S) {
        turboPhraseT.value = 0;
        runOnJS(onTurboPhrase)(turboPhraseIdx.value);
        turboPhraseIdx.value += 1;
      }
      if (now > turboEnd.value || Math.abs(vel.value) < TURBO_EXIT_VELOCITY) {
        clearRotBuf();
        target.value = nearestDetent(theta.value);
        phase.value = 'spring';
        runOnJS(onTurboEnd)();
      }
    } else if (phase.value === 'spring') {
      const damping = 2 * Math.sqrt(SPRING_K) * (1.05 - 0.62 * BOUNCE);
      vel.value += (SPRING_K * (target.value - theta.value) - damping * vel.value) * dt;
      theta.value += vel.value * dt;
      if (
        Math.abs(target.value - theta.value) < SETTLE_ANGLE &&
        Math.abs(vel.value) < SETTLE_VELOCITY
      ) {
        theta.value = target.value;
        vel.value = 0;
        phase.value = 'idle';
        settlePulse.value += 1;
        runOnJS(onSettle)(activeIndexFor(theta.value));
      }
    }

    // Detent-crossing detection — works for drag, fling, spring and turbo alike.
    const ai = activeIndexFor(theta.value);
    if (ai !== activeIdx.value) {
      const delta = theta.value - lastTheta.value;
      const dir: SpinDirection = (delta !== 0 ? delta : vel.value) >= 0 ? 'left' : 'right';
      activeIdx.value = ai;
      runOnJS(onIndexChange)(ai, dir);
    }
    lastTheta.value = theta.value;

    // Cosmetic idle sway on the displayed angle only.
    thetaDisplay.value =
      theta.value +
      (phase.value === 'idle' && SWAY_ENABLED ? Math.sin(now / 850) * 0.026 : 0);

    // Feed the Aurora shader background — it reads these as uniforms every
    // frame, so the backdrop swirls continuously with the dial.
    auroraFlow.theta.value = thetaDisplay.value;
    auroraFlow.energy.value = Math.abs(vel.value);
  });

  return {
    theta,
    thetaDisplay,
    vel,
    phase,
    settlePulse,
    beginDrag,
    dragBy,
    endDrag,
    spinTo,
  };
}
