// Ported from Aurix (src/styles/global.css --aurix-* tokens). Key *shapes*
// (COLORS.text.primary, COLORS.accent.green, etc.) are kept unchanged from
// the original NOTE theme so every existing screen keeps compiling — only
// the values move to Aurix's palette. Screens get visually restyled in
// Phase 3; this phase only swaps the source of truth.
export const COLORS = {
  background: '#0A0A0A',        // --aurix-bg-primary
  surface: '#141414',           // --aurix-bg-secondary
  surfaceLight: '#1C1C1E',      // --aurix-bg-elevated
  glass: 'rgba(28, 28, 30, 0.72)', // --aurix-glass
  // Opaque lift for bars that sit over scrolling content (mini player, tab bar).
  // These must not be translucent: blur is unreliable on Android, so content
  // would otherwise read straight through them.
  surfaceRaised: '#1C1C1E',     // --aurix-bg-elevated (opaque variant)
  hairline: 'rgba(255, 255, 255, 0.08)', // --aurix-divider
  glassBorder: 'rgba(255, 255, 255, 0.08)',

  text: {
    primary: '#FFFFFF',    // --aurix-text-primary
    secondary: '#A1A1AA',  // --aurix-text-secondary
    muted: '#6B7280',      // --aurix-text-tertiary
    disabled: '#4B5563',   // --aurix-text-disabled (new — Aurix has no NOTE equivalent)
  },

  // Aurix has one accent (#FA2D55), not a green/red pair. Both keys now
  // point at it so existing "success-ish" and "active-ish" usages land on
  // the same brand color; genuine destructive/error states use `red`.
  accent: {
    green: '#FA2D55',                  // --aurix-accent (primary brand accent)
    greenGlow: 'rgba(250, 45, 85, 0.18)',
    red: '#FF4444',                    // kept distinct — Aurix has no destructive-red token, this stays for error states
    redGlow: 'rgba(255, 68, 68, 0.15)',
  },

  player: {
    progressTrack: 'rgba(255, 255, 255, 0.2)',
    progressFill: '#FA2D55',           // was pure white — now brand accent, matches Aurix player bar
  },

  iconInactive: '#8E8E93', // --aurix-icon-inactive (new)
};

export const SIZES = {
  /**
   * Clearance a scrolling screen must leave at the bottom so the last row is
   * never trapped under the tab bar + mini player.
   */
  bottomInset: 130,
  // Aurix spacing scale (--aurix-space-1..7)
  xs: 4,
  sm: 8,
  smd: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  radius: {
    sm: 14,      // --aurix-radius-button
    search: 16,  // --aurix-radius-search
    md: 18,      // --aurix-radius-artwork / miniplayer
    lg: 20,      // --aurix-radius-card
    pill: 999,
  }
};

// Aurix uses Google Font "Outfit" (weights 300–900) loaded via @expo-google-fonts/outfit.
// See App.tsx for the useFonts() gate — until fonts load, these keys fall back
// to 'System' so nothing crashes mid-load.
export const FONTS = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
};

export const SHADOWS = {
  glass: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10, // For Android
  },
  ambient: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  }
};
