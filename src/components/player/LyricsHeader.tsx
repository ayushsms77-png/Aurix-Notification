import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../../constants/theme';

/**
 * Header for the Now Playing LYRICS view: "Λurix" on the left, a compact
 * hot-pink waveform on the right. Nothing else -- no back arrow, no playlist
 * button, no artwork.
 */

const HOT_PINK = '#FF4D6D';

// ---- wordmark ---------------------------------------------------------------
// Outfit ExtraBold outlines baked into SVG paths (viewBox units == 22px type).
// Outfit has no Greek capital lambda, so a <Text> would draw that one letter in
// a fallback font; here it is Outfit's own "V" turned upside-down, so the
// weight and proportions match the rest of the word exactly.
const GLYPHS = [
  { w: 15.88, d: 'M9.75 -15.6 15.62 0H11.42L7.02 -12.61H8.82L4.36 0H0.24L6.18 -15.6Z' }, // Lambda
  { w: 12.1, d: 'M6.05 0.24Q4.53 0.24 3.35 -0.36Q2.18 -0.97 1.51 -2.06Q0.84 -3.15 0.84 -4.53V-10.76H4.66V-4.53Q4.66 -4.09 4.84 -3.76Q5.02 -3.43 5.32 -3.26Q5.63 -3.08 6.05 -3.08Q6.67 -3.08 7.05 -3.48Q7.44 -3.87 7.44 -4.53V-10.76H11.26V-4.53Q11.26 -3.12 10.6 -2.05Q9.94 -0.97 8.77 -0.36Q7.59 0.24 6.05 0.24Z' }, // u
  { w: 9.97, d: 'M1.12 0V-10.76H4.95V0ZM4.95 -5.85 3.23 -7.3Q3.87 -9.13 4.93 -10.05Q5.98 -10.98 7.68 -10.98Q8.45 -10.98 9.01 -10.78Q9.57 -10.58 9.97 -10.16L7.74 -7.19Q7.57 -7.39 7.25 -7.51Q6.93 -7.63 6.53 -7.63Q5.79 -7.63 5.37 -7.18Q4.95 -6.73 4.95 -5.85Z' }, // r
  { w: 6.05, d: 'M1.1 0V-10.76H4.95V0ZM3.01 -12.01Q2.16 -12.01 1.58 -12.59Q1.01 -13.18 1.01 -14.06Q1.01 -14.92 1.58 -15.51Q2.16 -16.1 3.01 -16.1Q3.92 -16.1 4.48 -15.51Q5.04 -14.92 5.04 -14.06Q5.04 -13.18 4.48 -12.59Q3.92 -12.01 3.01 -12.01Z' }, // i
  { w: 12.1, d: 'M7.68 0 5.37 -3.98 4.49 -4.51 0.24 -10.76H4.66L6.93 -6.89L7.77 -6.4L12.08 0ZM0.02 0 4.44 -6.36 6.62 -4 4.11 0ZM7.63 -4.51 5.46 -6.86 7.77 -10.76H11.86Z' }, // x
];
const GLYPH_H = 18.35;
const GLYPH_TOP = 17.1;
const SCALE = 28 / 22; // glyphs are baked at 22px type; this makes them match the 28px lyric text
const TRACKING = 1.2;

const PULSE_HALF_MS = 950; // one full breath = 1.9s
const PULSE_LAG_MS = 150; // each letter starts a beat after the previous one
const OPACITY_LOW = 0.55;
const OPACITY_HIGH = 1;

/**
 * Every letter runs the SAME continuous, eased opacity breath; each one is
 * simply started a little later than the letter before it, so the brightness
 * change rolls gently from left to right. Opacity only -- no glow, shadow,
 * shine or moving highlight -- and it runs on the native driver.
 */
const AurixWordmark: React.FC = () => {
  const pulses = useRef(GLYPHS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const runs = pulses.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * PULSE_LAG_MS),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, {
              toValue: 1,
              duration: PULSE_HALF_MS,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(v, {
              toValue: 0,
              duration: PULSE_HALF_MS,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),
      ])
    );
    runs.forEach((r) => r.start());
    return () => runs.forEach((r) => r.stop());
  }, [pulses]);

  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Aurix">
      {GLYPHS.map((g, i) => (
        <Animated.View
          key={i}
          style={{
            marginRight: i < GLYPHS.length - 1 ? TRACKING * SCALE : 0,
            opacity: pulses[i].interpolate({
              inputRange: [0, 1],
              outputRange: [OPACITY_LOW, OPACITY_HIGH],
            }),
          }}
        >
          <Svg
            width={g.w * SCALE}
            height={GLYPH_H * SCALE}
            viewBox={`0 ${-GLYPH_TOP} ${g.w} ${GLYPH_H}`}
          >
            <Path d={g.d} fill={COLORS.text.primary} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
};

// ---- waveform ---------------------------------------------------------------
const BAR_COUNT = 7;
const BAR_W = 3;
const BAR_GAP = 3;
const BAR_H = 22;
const BAR_REST = 0.28;
// Different periods per bar so the bars never move in lock-step.
const BAR_MS = [520, 380, 610, 440, 560, 400, 500];
const BAR_LOW = [0.3, 0.22, 0.35, 0.25, 0.3, 0.28, 0.24];
const BAR_HIGH = [0.75, 0.95, 0.7, 1, 0.8, 0.9, 0.65];

/**
 * Compact animated waveform. Bars scale vertically on the native driver (no
 * layout work per frame). They dance while audio is playing and settle to a
 * low, still shape when it is paused, so a paused player is not animating.
 */
const Waveform: React.FC<{ active: boolean }> = ({ active }) => {
  const bars = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(BAR_REST))).current;

  useEffect(() => {
    if (!active) {
      const settle = bars.map((v) =>
        Animated.timing(v, { toValue: BAR_REST, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true })
      );
      Animated.parallel(settle).start();
      return () => settle.forEach((a) => a.stop());
    }
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: BAR_HIGH[i], duration: BAR_MS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: BAR_LOW[i], duration: BAR_MS[i], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);

  return (
    <View style={styles.waveform} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, i > 0 && { marginLeft: BAR_GAP }, { transform: [{ scaleY: v }] }]}
        />
      ))}
    </View>
  );
};

export const LyricsHeader: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => (
  <View style={styles.row}>
    <AurixWordmark />
    <Waveform active={isPlaying} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    // flex:1 so the row fills the header: wordmark hugs the left edge and the
    // waveform sits at the far right, exactly where the playlist icon used to be.
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Same height the icon header had, so the artwork/lyrics area below never shifts.
    minHeight: 36,
  },
  wordmark: { flexDirection: 'row', alignItems: 'center' },
  waveform: { flexDirection: 'row', alignItems: 'center', height: BAR_H, paddingRight: 4 },
  bar: { width: BAR_W, height: BAR_H, borderRadius: BAR_W / 2, backgroundColor: HOT_PINK },
});
