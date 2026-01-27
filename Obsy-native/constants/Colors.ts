const silver = '#E5E7EB';
const silverSoft = '#F5F5F7';
const silverStrong = '#D1D5DB';
const obsyDarkBg = '#050608';
const obsyBgOuter = '#0B0C10';

// Light theme (Cream/Journal) colors
const creamBg = '#E8E4D9'; // Rich cream - "Kraft Paper" vibe
const creamText = '#1A1A1A'; // Dark grey (not pure black - too harsh on cream)
const creamTextSecondary = '#2D2D2D'; // Slightly lighter dark grey

// Insight highlight colors
const emerald = '#10B981'; // Emerald Green
const purple = '#A855F7';  // Soft Purple
const orange = '#F97316';  // Warm Orange
const blue = '#60A5FA';    // Soft Blue (matches ambient background)

export const Colors = {
  light: {
    text: creamText,
    textSecondary: creamTextSecondary,
    background: creamBg,
    tint: '#4A4A4A', // Darker tint for light mode
    tabIconDefault: '#8B8B8B',
    tabIconSelected: creamText,
    glass: 'rgba(0, 0, 0, 0.08)',
    glassBorder: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    text: '#fff',
    textSecondary: 'rgba(255,255,255,0.6)',
    background: obsyDarkBg,
    tint: silver,
    tabIconDefault: '#6B7280',
    tabIconSelected: silver,
    glass: 'rgba(255, 255, 255, 0.1)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
  },
  obsy: {
    silver,
    silverSoft,
    silverStrong,
    bg: obsyDarkBg,
    bgOuter: obsyBgOuter,
    glass: 'rgba(255, 255, 255, 0.1)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    // Cream theme specific
    creamBg,
    creamText,
    creamTextSecondary,
  },
  // Insight highlight colors - used for AI-selected sentence highlights
  highlight: {
    emerald,
    purple,
    orange,
    blue,
  }
};

export default Colors;
