# Obsy Web to Native Migration Plan

## 1. Architecture Summary (Web)

The existing `obsy-web` is a Single Page Application (SPA) built with:
- **Framework:** Vite + React
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Radix UI + Custom "Glassmorphism" (gradients, blurs)
- **State Management:** Zustand (`captureStore`, `challengeStore`) + React Context (`AuthContext`, `ThemeContext`)
- **Data Fetching:** React Query + Supabase Client
- **Routing:** `react-router-dom`
- **Key Features:**
  - **Auth:** Supabase (Email, Google, Apple)
  - **Capture:** Camera/Upload flow -> AI Analysis -> Insight Generation
  - **Gallery:** Grid view of captures
  - **Insights:** Data visualization of mood/habits over time
  - **Profile:** User settings and stats

## 2. Proposed React Native / Expo Structure

We will use **Expo (Managed Workflow)** with **Expo Router** for a modern, file-based navigation structure similar to Next.js, which aligns well with the web's component structure.

### Directory Layout (`/Obsy-native`)

```
/Obsy-native
  /app                   # Expo Router pages
    /_layout.tsx         # Root layout (Providers: Auth, Query, Theme)
    /(tabs)              # Main Tab Navigation
      /_layout.tsx       # Tab Bar configuration
      index.tsx          # Home Screen
      gallery.tsx        # Gallery Screen
      insights.tsx       # Insights Screen
      profile.tsx        # Profile Screen
    /capture             # Capture Stack (Modal or Fullscreen)
      index.tsx          # Camera/Upload
      review.tsx         # Review & Tagging
      [id].tsx           # Capture Detail
    /auth                # Auth Stack
      login.tsx
      signup.tsx
  /components            # Reusable UI
    /ui                  # Primitives (Button, Card, Input)
    /navigation          # Custom Tab Bar, Headers
    /insights            # Charts, Stat Cards
  /constants             # Config
    Colors.ts            # Ported from tailwind.config.ts
    Layout.ts
  /hooks                 # Custom Hooks (useAuth, useTheme)
  /lib                   # Core Logic (Shared with Web)
    supabase.ts          # Supabase Client (with AsyncStorage)
    captureStore.ts      # Zustand Store
    utils.ts             # Helpers
  /assets                # Images, Fonts
```

### Styling Strategy
- **Core:** `StyleSheet.create` for performance and type safety.
- **Theme:** Centralized `Colors` object matching `tailwind.config.ts` (Obsy Dark, Silver Accents).
- **Glassmorphism:** `expo-blur` for glass effects + `expo-linear-gradient` for backgrounds.
- **Typography:** Custom fonts (if any) or system fonts, defined in `constants/Theme.ts`.

---

## 3. Migration Checklist

### Phase 1: Project Setup & Foundation
- [x] **Initialize Expo Project**
  - Command: `npx create-expo-app@latest . --template tabs` (inside Obsy-native)
  - Clean up default template code.
- [x] **Install Core Dependencies**
  - `npm install @supabase/supabase-js @react-native-async-storage/async-storage @tanstack/react-query zustand clsx tailwind-merge`
  - `npx expo install expo-blur expo-linear-gradient expo-haptics expo-image expo-secure-store`
- [x] **Setup Theme System**
  - Source: `obsy-web/tailwind.config.ts`
  - Target: `Obsy-native/constants/Colors.ts`
  - Action: Extract colors (primary, secondary, accent.silver, obsy-dark-bg, etc.) into a constant object.
- [x] **Setup Supabase Client**
  - Source: `obsy-web/src/integrations/supabase/client.ts`
  - Target: `Obsy-native/lib/supabase.ts`
  - Action: Configure `SupabaseClient` with `AsyncStorage` for session persistence.

### Phase 2: Core Logic & State
- [x] **Port Auth Context**
  - Source: `obsy-web/src/contexts/AuthContext.tsx`
  - Target: `Obsy-native/contexts/AuthContext.tsx` (or `hooks/useAuth.tsx`)
  - Action: Adapt for RN (no `window.location`).
- [x] **Port Capture Store**
  - Source: `obsy-web/src/lib/captureStore.ts`
  - Target: `Obsy-native/lib/captureStore.ts`
  - Action: Ensure Zustand persistence uses `AsyncStorage` if needed.
- [ ] **Port Utilities**
  - Source: `obsy-web/src/lib/utils.ts`, `obsy-web/src/lib/dateUtils.ts`
  - Target: `Obsy-native/lib/utils.ts`

### Phase 3: UI Components (The "Obsy Look")
- [x] **Create Screen Wrapper (Background)**
  - Target: `Obsy-native/components/ScreenWrapper.tsx`
  - Action: Implement the "Obsy Dark" radial gradient background (`backgroundImage` in tailwind config).
- [x] **Create Glass Card**
  - Source: `obsy-web/src/index.css` (`.glass-card` classes)
  - Target: `Obsy-native/components/ui/GlassCard.tsx`
  - Action: Use `<BlurView>` (iOS) or semi-transparent View (Android) with border and shadow.
- [x] **Create Typography Components**
  - Target: `Obsy-native/components/ui/Text.tsx`
  - Action: Standardize `H1`, `H2`, `Body`, `Caption` with correct colors and fonts.

### Phase 4: Screens Implementation
#### Home Screen
- [ ] **Layout & Header**
  - Source: `obsy-web/src/pages/Home.tsx`
  - Target: `Obsy-native/app/(tabs)/index.tsx`
- [ ] **Recent Captures Feed**
  - Source: `obsy-web/src/components/home/RecentCaptures.tsx`
  - Target: `Obsy-native/components/home/RecentCaptures.tsx`

#### Gallery Screen
- [ ] **Grid Layout**
  - Source: `obsy-web/src/pages/Gallery.tsx`
  - Target: `Obsy-native/app/(tabs)/gallery.tsx`
  - Action: Use `FlatList` with `numColumns={2}` or `MasonryFlashList`.

#### Insights Screen
- [x] **Main Layout**
  - Source: `obsy-web/src/pages/Insights.tsx`
  - Target: `Obsy-native/app/(tabs)/insights.tsx`
- [ ] **Charts & Stats**
  - Source: `obsy-web/src/components/insights/...`
  - Target: `Obsy-native/components/insights/...`
  - Action: Find RN alternatives for charts (e.g., `react-native-gifted-charts` or custom SVG).

#### Profile / Settings
- [ ] **Profile View**
  - Source: `obsy-web/src/pages/Profile.tsx`
  - Target: `Obsy-native/app/(tabs)/profile.tsx`

### Phase 5: Capture Flow (Native Specifics)
- [x] **Camera Integration**
  - Target: `Obsy-native/app/capture/index.tsx`
  - Action: Implement `expo-camera` or `react-native-vision-camera`.
- [x] **Image Upload/Preview**
  - Target: `Obsy-native/app/capture/review.tsx`

### Phase 6: Polish & QA
- [ ] **Navigation Polish** (Transitions, Tab Bar styling)
- [ ] **Platform Adjustments** (SafeAreaView, StatusBar)
- [ ] **Testing** (Auth flow, Data persistence, Offline handling)
