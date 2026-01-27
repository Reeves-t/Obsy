# Obsy Light Theme Fixes - File-by-File Guide

**Generated:** 2025-06-30
**Issue:** Hardcoded white/rgba(255,255,255) colors don't work on cream light theme background

## The Fix Pattern

Replace hardcoded colors with theme-aware alternatives:

```tsx
// BEFORE (breaks on light theme)
color: 'rgba(255,255,255,0.6)'
color: '#fff'
color: 'white'

// AFTER (works on both themes)
import { useObsyTheme } from '@/contexts/ThemeContext';
const { colors, isLight } = useObsyTheme();

color: colors.text              // Primary text
color: colors.textSecondary     // Secondary text  
color: colors.textTertiary      // Tertiary/muted text

// Or for inline conditional:
color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
```

---

## Priority 1: Insights Tab (Most Visible)

### `app/(tabs)/insights.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 719 | `color="rgba(255,255,255,0.9)"` (Sunrise icon) | `color={isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)'}` |
| 733 | `color="rgba(255,255,255,0.9)"` (Sun icon) | Same pattern |
| 747 | `color="rgba(255,255,255,0.9)"` (MoonStar icon) | Same pattern |
| 935 | `color: '#FFFFFF'` | `color: colors.text` |
| 943 | `color: '#FFFFFF'` | `color: colors.text` |
| 981 | `color: '#FFFFFF'` | `color: colors.text` |
| 1031 | `color: 'rgba(255,255,255,0.5)'` | `color: colors.textSecondary` |
| 1046 | `color: '#FFFFFF'` | `color: colors.text` |
| 1050 | `color: 'rgba(255,255,255,0.6)'` | `color: colors.textSecondary` |
| 1070 | `color: 'rgba(255,255,255,0.75)'` | `color: colors.textSecondary` |
| 1108 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 1152 | `color: '#fff'` | `color: colors.text` |
| 1157 | `color: 'rgba(255,255,255,0.5)'` | `color: colors.textSecondary` |
| 1207 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 1232 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 1238 | `color: '#FFFFFF'` | `color: colors.text` |
| 1242 | `color: 'rgba(255,255,255,0.3)'` | `color: colors.textTertiary` |

Background colors (lines 883, 895, 970, 1011, 1064, 1084, 1096, 1131, 1137, 1191, 1218) also need `isLight` conditionals.

---

### `components/insights/MoodSignal.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 183 | `backgroundColor: 'rgba(255,255,255,0.03)'` | Add isLight conditional |
| 188 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 213 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 218 | `color: 'rgba(255,255,255,0.3)'` | `color: colors.textTertiary` |
| 231 | `color: 'rgba(255,255,255,0.6)'` | `color: colors.textSecondary` |

---

### `components/insights/MoodFlow.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 177 | `color: "rgba(255,255,255,0.55)"` | `color: colors.textSecondary` |
| 202 | `color: "#fff"` | `color: colors.text` |
| 212 | `color: "rgba(255,255,255,0.7)"` | `color: colors.textSecondary` |

---

### `components/insights/WeeklySummaryCard.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 252 | `color: "rgba(255,255,255,0.4)"` | `color: colors.textTertiary` |
| 262 | `color: "rgba(255,255,255,0.7)"` | `color: colors.textSecondary` |
| 269 | `color: "rgba(255,255,255,0.9)"` | `color: colors.text` |
| 276 | `color: "rgba(255,255,255,0.6)"` | `color: colors.textSecondary` |
| 285 | `color: "#fff"` | `color: colors.text` |
| 301 | `color: "rgba(255,255,255,0.6)"` | `color: colors.textSecondary` |
| 306 | `color: "#fff"` | `color: colors.text` |

---

### `components/insights/MoodRingDial.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 387 | `color: "#fff"` | `color: colors.text` |
| 394 | `color: "rgba(255,255,255,0.5)"` | `color: colors.textSecondary` |
| 401 | `color: "rgba(255,255,255,0.4)"` | `color: colors.textTertiary` |
| 426 | `color: 'rgba(255,255,255,0.85)'` | `color: colors.text` |
| 439 | `color: 'rgba(255,255,255,0.85)'` | `color: colors.text` |
| 446 | `color: 'rgba(255,255,255,0.3)'` | `color: colors.textTertiary` |

---

### `components/insights/MonthView.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 543 | `color: "#fff"` | `color: colors.text` |
| 569 | `color: "rgba(255,255,255,0.4)"` | `color: colors.textTertiary` |
| 615 | `color: "#fff"` | `color: colors.text` |
| 629 | `color: "rgba(255,255,255,0.6)"` | `color: colors.textSecondary` |

---

## Priority 2: Year in Pixels

### `components/yearInPixels/PixelGrid.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 263 | `color: 'rgba(255,255,255,0.4)'` | `color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'` |
| 281 | `color: 'rgba(255,255,255,0.3)'` | `color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)'` |

---

### `components/yearInPixels/LegendPanel.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 287 | `color: 'rgba(255,255,255,0.5)'` | `color: isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'` |
| 315 | `color: 'rgba(255,255,255,0.4)'` | Same pattern |
| 367 | `color: 'rgba(255,255,255,0.4)'` | Same pattern |

---

### `components/yearInPixels/YearInPixelsInfoModal.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 85 | `color: 'rgba(255,255,255,0.4)'` | `color: colors.textTertiary` |
| 105 | `color: 'rgba(255,255,255,0.3)'` | `color: colors.textTertiary` |
| 110 | `color: 'rgba(255,255,255,0.7)'` | `color: colors.textSecondary` |
| 124 | `color: '#fff'` | `color: colors.text` |

---

### `components/yearInPixels/ExpandedDayCanvas.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 291 | `color: 'rgba(255,255,255,0.4)'` | Add isLight conditional |
| 369 | `color: 'rgba(255,255,255,0.6)'` | Same |
| 411 | `color: 'rgba(255,255,255,0.4)'` | Same |
| 447 | `color: 'rgba(255,255,255,0.4)'` | Same |

---

## Priority 3: Home Components

### `components/home/YearInPixelsSection.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 66 | `color="rgba(255,255,255,0.4)"` | Add isLight conditional |
| 112 | `color: 'rgba(255,255,255,0.3)'` | Same |

---

### `components/home/PulsingCameraTrigger.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 116 | `color="rgba(255,255,255,0.8)"` | `color={isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'}` |

---

### `components/home/TodayCaptureCard.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 106 | `color: 'white'` | `color: colors.text` |
| 118 | `color: 'rgba(255,255,255,0.9)'` | `color: colors.text` |
| 136 | `color: 'rgba(255,255,255,0.92)'` | `color: colors.text` |

---

### `components/home/TodayCollectionStack.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 70 | `color: 'rgba(255,255,255,0.5)'` | `color: colors.textSecondary` |

---

### `components/home/DailyChallengeCard.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 84 | `color: '#FFFFFF'` | `color: colors.text` |
| 93 | `color: 'rgba(255,255,255,0.6)'` | `color: colors.textSecondary` |
| 105 | `color: 'rgba(255,255,255,0.6)'` | `color: colors.textSecondary` |

---

## Priority 4: Other Components

### `components/insights/ToneTriggerButton.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 24 | `color="rgba(255,255,255,0.4)"` | Add isLight conditional |
| 49 | `color: 'rgba(255,255,255,0.8)'` | `color: colors.text` |

---

### `components/insights/BookmarkButton.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 58 | Multiple white colors | Add isLight conditional |

---

### `components/insights/ArchiveStorageIndicator.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 60 | `color: 'rgba(255,255,255,0.6)'` | Add isLight conditional |
| 64 | `color: 'rgba(255,255,255,0.3)'` | Same |

---

### `components/insights/ChallengeInsightSection.tsx`
| Line | Current | Fix |
|------|---------|-----|
| 115 | `color: "rgba(255,255,255,0.6)"` | `color: colors.textSecondary` |
| 128 | `color: "rgba(255,255,255,0.65)"` | Same |
| 135 | `color: "rgba(255,255,255,0.9)"` | `color: colors.text` |

---

## Summary

**Total files to update:** ~20 files
**Total line changes:** ~100+ lines

**Approach:**
1. Each file needs to import `useObsyTheme` if not already
2. Get `{ colors, isLight }` from the hook
3. Replace hardcoded colors with theme-aware values
4. Test both dark and light modes

**Note:** Some files like `InsightText.tsx` and `TodayInsightCard.tsx` already have good isLight conditionals — use them as reference patterns.
