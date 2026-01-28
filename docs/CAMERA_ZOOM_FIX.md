# Camera Zoom Fix

**Issue:** Zoom doesn't work on capture preview. Circle in center changes size but camera doesn't actually zoom. Multiple zoom pills at bottom not needed.

---

## Bugs Found

### 1. Wrong Zoom Prop Value

**File:** `app/capture/index.tsx`, line ~232

**Bug:**
```typescript
<CameraView
    ...
    zoom={zoom.value}  // BUG: zoom is a number, not a shared value!
```

**Problem:** `zoom` is React state (a number), but code calls `.value` on it as if it were a Reanimated shared value. This results in `undefined` being passed to the camera.

**Fix:**
```typescript
<CameraView
    ...
    zoom={zoom}  // Correct: pass the number directly
```

### 2. UI Simplification Needed

**Current:** Multiple zoom pills (.5x, 1x, 2x, 3x) + separate zoom display text + center indicator circle

**Requested:** Single circle that displays current zoom level

---

## Recommended Changes

### Fix 1: Correct the zoom prop

```diff
- zoom={zoom.value}
+ zoom={zoom}
```

### Fix 2: Simplify UI to single zoom indicator

Remove the zoom pills, keep just one indicator showing zoom level:

```typescript
// Remove ZOOM_PRESETS and related state
// Remove zoomPillsContainer and children
// Keep or enhance the single zoom display

// In bottomControls, replace zoom pills with single indicator:
<View style={styles.zoomIndicator}>
    <Text style={styles.zoomIndicatorText}>{displayZoom}x</Text>
</View>
```

### Fix 3: Remove center indicator circle (optional)

The center circle that changes size with zoom can be removed since it doesn't serve a clear purpose:

```diff
- {/* Center zoom indicator */}
- <View style={styles.centerIndicatorContainer}>
-     <Animated.View style={[styles.centerIndicator, centerIndicatorStyle]} />
- </View>
```

---

## Full Diff

```diff
--- a/app/capture/index.tsx
+++ b/app/capture/index.tsx
@@ -229,7 +229,7 @@ export default function CaptureScreen() {
                         facing={facing}
                         ref={cameraRef}
-                        zoom={zoom.value}
+                        zoom={zoom}
                         flash={flashMode}
                     >
                         {/* Corner accents */}
@@ -238,11 +238,6 @@ export default function CaptureScreen() {
                         <View style={[styles.cornerAccent, styles.cornerBL]} />
                         <View style={[styles.cornerAccent, styles.cornerBR]} />

-                        {/* Center zoom indicator - REMOVE */}
-                        <View style={styles.centerIndicatorContainer}>
-                            <Animated.View style={[styles.centerIndicator, centerIndicatorStyle]} />
-                        </View>
                     </CameraView>
                 </View>
             </GestureDetector>

@@ -252,23 +247,11 @@ export default function CaptureScreen() {
                 {/* Zoom display */}
-                <Text style={styles.zoomDisplayText}>{displayZoom}x</Text>
-
-                {/* Zoom Pills - REMOVE */}
-                <View style={styles.zoomPillsContainer}>
-                    {ZOOM_PRESETS.map((preset, index) => (
-                        <TouchableOpacity
-                            key={preset.label}
-                            onPress={() => handleZoomPreset(index)}
-                            style={[
-                                styles.zoomPill,
-                                selectedPresetIndex === index && styles.zoomPillSelected
-                            ]}
-                        >
-                            <Text style={...}>{preset.label}</Text>
-                        </TouchableOpacity>
-                    ))}
+                {/* Single zoom indicator */}
+                <View style={styles.zoomIndicator}>
+                    <Text style={styles.zoomIndicatorText}>{displayZoom}x</Text>
                 </View>
```

---

## New Styles for Single Zoom Indicator

```typescript
// Replace zoomPills styles with:
zoomIndicator: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
},
zoomIndicatorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
},
```

---

## Pinch-to-Zoom Still Works

The pinch gesture handler is correctly implemented and will still work after these changes. Users pinch to zoom, and the single indicator shows the current level.

---

## Testing Checklist

After fix:
- [ ] Camera actually zooms when pinching
- [ ] Single zoom indicator shows current level (e.g., "1.5x")
- [ ] Zoom indicator updates smoothly during pinch
- [ ] No more faint circle in center of preview
- [ ] No more multiple zoom pills at bottom
