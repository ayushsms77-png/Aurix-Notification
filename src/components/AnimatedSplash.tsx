import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Second splash: shown right after the native splash, then fades into the app.
 *
 * Seamless hand-off rules (don't break these):
 *  - The logo is the SAME image as the native splash (assets/splash-icon.png),
 *    at the SAME size (LOGO_SIZE == imageWidth in app.json) and dead centre.
 *    The native splash is only hidden once this logo has drawn, so the two
 *    frames are identical and nothing jumps.
 *  - Only the text is animated; the logo never moves.
 *
 * The wordmark and tagline are Outfit glyph outlines baked into SVG paths
 * (Outfit has no Greek capital lambda, so a plain <Text> would fall back to a
 * system font for the first letter). Baked paths also mean this screen needs
 * no font to be loaded.
 */

const LOGO_SIZE = 288; // keep in sync with imageWidth in app.json
/** Distance from image centre to the logo's visible bottom edge, in dp. */
const LOGO_BOTTOM = 61;
const TEXT_GAP = 34;
const OFF_WHITE = '#F2EFE9';

const TEXT_IN_MS = 450;
const HOLD_MS = 900;
const FADE_OUT_MS = 320;

// "Λurix" -- Outfit SemiBold, 48dp. Λ is Outfit's V rotated 180 degrees.
const WORDMARK_W = 128.54;
const WORDMARK_CAP = 33.74;
const WORDMARK_D =
  'M19.58 -33.74 32.88 0H25.82L15.55 -27.31H18.29L7.92 0H0.96L14.4 -33.74Z M49.39 0.48Q46.32 0.48 43.94 -0.82Q41.57 -2.11 40.22 -4.42Q38.88 -6.72 38.88 -9.74V-23.18H45.22V-9.89Q45.22 -8.45 45.7 -7.42Q46.18 -6.38 47.14 -5.86Q48.1 -5.33 49.39 -5.33Q51.36 -5.33 52.46 -6.53Q53.57 -7.73 53.57 -9.89V-23.18H59.86V-9.74Q59.86 -6.67 58.54 -4.37Q57.22 -2.06 54.84 -0.79Q52.46 0.48 49.39 0.48Z M67.73 0V-23.18H74.02V0ZM74.02 -12.82 71.57 -14.45Q72 -18.72 74.06 -21.19Q76.13 -23.66 80.02 -23.66Q81.7 -23.66 83.04 -23.11Q84.38 -22.56 85.49 -21.31L81.55 -16.8Q81.02 -17.38 80.28 -17.66Q79.54 -17.95 78.58 -17.95Q76.56 -17.95 75.29 -16.68Q74.02 -15.41 74.02 -12.82Z M91.44 0V-23.18H97.78V0ZM94.61 -26.93Q93.07 -26.93 92.06 -27.96Q91.06 -28.99 91.06 -30.53Q91.06 -32.02 92.06 -33.07Q93.07 -34.13 94.61 -34.13Q96.19 -34.13 97.18 -33.07Q98.16 -32.02 98.16 -30.53Q98.16 -28.99 97.18 -27.96Q96.19 -26.93 94.61 -26.93Z M120.72 0 114.62 -9.41 113.33 -10.37 104.3 -23.18H111.74L117.36 -14.69L118.56 -13.78L128.11 0ZM103.82 0 113.28 -13.25 116.88 -8.98 110.93 0ZM118.8 -10.42 115.1 -14.64 120.62 -23.18H127.68Z';

// "Listen Without Limits!" -- Outfit Regular, 15dp, tracked out.
const TAGLINE_W = 193.69;
const TAGLINE_CAP = 10.41;
const TAGLINE_D =
  'M1.23 0V-10.41H2.64V0ZM2.19 0V-1.29H7.77V0Z M11.68 0V-7.12H13.04V0ZM12.36 -8.55Q11.98 -8.55 11.74 -8.8Q11.5 -9.04 11.5 -9.42Q11.5 -9.78 11.74 -10.03Q11.98 -10.28 12.36 -10.28Q12.73 -10.28 12.97 -10.03Q13.21 -9.78 13.21 -9.42Q13.21 -9.04 12.97 -8.8Q12.73 -8.55 12.36 -8.55Z M19.69 0.15Q19.09 0.15 18.56 -0.01Q18.03 -0.16 17.58 -0.46Q17.13 -0.75 16.8 -1.16L17.67 -2.02Q18.06 -1.54 18.57 -1.31Q19.08 -1.08 19.71 -1.08Q20.34 -1.08 20.68 -1.3Q21.03 -1.51 21.03 -1.91Q21.03 -2.29 20.75 -2.51Q20.47 -2.73 20.04 -2.87Q19.6 -3.01 19.12 -3.16Q18.63 -3.3 18.2 -3.52Q17.76 -3.75 17.48 -4.14Q17.2 -4.53 17.2 -5.17Q17.2 -5.82 17.52 -6.29Q17.83 -6.76 18.4 -7.02Q18.96 -7.27 19.75 -7.27Q20.59 -7.27 21.25 -6.98Q21.9 -6.69 22.32 -6.1L21.45 -5.23Q21.15 -5.62 20.71 -5.83Q20.26 -6.04 19.71 -6.04Q19.12 -6.04 18.82 -5.84Q18.51 -5.64 18.51 -5.28Q18.51 -4.92 18.78 -4.72Q19.05 -4.53 19.49 -4.39Q19.93 -4.26 20.41 -4.12Q20.89 -3.97 21.33 -3.73Q21.76 -3.49 22.04 -3.09Q22.32 -2.69 22.32 -2.02Q22.32 -1.02 21.61 -0.43Q20.89 0.15 19.69 0.15Z M27.33 0V-10.11H28.68V0ZM25.57 -5.89V-7.12H30.43V-5.89Z M37.45 0.15Q36.39 0.15 35.53 -0.34Q34.68 -0.82 34.19 -1.67Q33.69 -2.5 33.69 -3.57Q33.69 -4.62 34.18 -5.46Q34.66 -6.3 35.5 -6.79Q36.33 -7.27 37.37 -7.27Q38.35 -7.27 39.11 -6.82Q39.87 -6.38 40.3 -5.58Q40.73 -4.79 40.73 -3.78Q40.73 -3.63 40.71 -3.46Q40.7 -3.28 40.65 -3.06H34.63V-4.18H39.93L39.44 -3.75Q39.44 -4.47 39.18 -4.97Q38.92 -5.47 38.46 -5.75Q37.99 -6.03 37.34 -6.03Q36.64 -6.03 36.12 -5.73Q35.59 -5.43 35.31 -4.89Q35.02 -4.35 35.02 -3.61Q35.02 -2.86 35.33 -2.3Q35.62 -1.74 36.18 -1.43Q36.73 -1.12 37.45 -1.12Q38.05 -1.12 38.56 -1.33Q39.06 -1.54 39.42 -1.96L40.29 -1.08Q39.78 -0.48 39.04 -0.16Q38.3 0.15 37.45 0.15Z M49.63 0V-4.16Q49.63 -4.96 49.12 -5.49Q48.61 -6.01 47.8 -6.01Q47.26 -6.01 46.84 -5.78Q46.42 -5.54 46.18 -5.12Q45.94 -4.69 45.94 -4.16L45.39 -4.47Q45.39 -5.28 45.75 -5.91Q46.11 -6.54 46.75 -6.91Q47.4 -7.27 48.21 -7.27Q49.02 -7.27 49.64 -6.87Q50.27 -6.46 50.62 -5.81Q50.98 -5.16 50.98 -4.42V0ZM44.59 0V-7.12H45.94V0Z  M63.63 0 60.22 -10.41H61.63L64.33 -1.92H63.93L66.58 -10.41H67.6L70.26 -1.92H69.87L72.57 -10.41H73.96L70.57 0H69.57L66.9 -8.47H67.29L64.63 0Z M77.86 0V-7.12H79.21V0ZM78.54 -8.55Q78.16 -8.55 77.92 -8.8Q77.68 -9.04 77.68 -9.42Q77.68 -9.78 77.92 -10.03Q78.16 -10.28 78.54 -10.28Q78.91 -10.28 79.15 -10.03Q79.39 -9.78 79.39 -9.42Q79.39 -9.04 79.15 -8.8Q78.91 -8.55 78.54 -8.55Z M84.7 0V-10.11H86.05V0ZM82.95 -5.89V-7.12H87.81V-5.89Z M96.57 0V-4.16Q96.57 -4.96 96.06 -5.49Q95.55 -6.01 94.74 -6.01Q94.2 -6.01 93.78 -5.78Q93.36 -5.54 93.12 -5.12Q92.88 -4.69 92.88 -4.16L92.32 -4.47Q92.32 -5.28 92.68 -5.91Q93.04 -6.54 93.69 -6.91Q94.33 -7.27 95.14 -7.27Q95.95 -7.27 96.58 -6.91Q97.2 -6.55 97.56 -5.91Q97.92 -5.26 97.92 -4.42V0ZM91.53 0V-10.71H92.88V0Z M105.41 0.15Q104.35 0.15 103.51 -0.34Q102.67 -0.84 102.18 -1.69Q101.69 -2.53 101.69 -3.58Q101.69 -4.62 102.18 -5.45Q102.67 -6.29 103.51 -6.78Q104.35 -7.27 105.41 -7.27Q106.44 -7.27 107.29 -6.79Q108.13 -6.3 108.63 -5.46Q109.12 -4.62 109.12 -3.58Q109.12 -2.53 108.63 -1.69Q108.13 -0.84 107.29 -0.34Q106.44 0.15 105.41 0.15ZM105.41 -1.16Q106.08 -1.16 106.6 -1.47Q107.13 -1.78 107.43 -2.33Q107.73 -2.88 107.73 -3.58Q107.73 -4.27 107.42 -4.81Q107.11 -5.35 106.6 -5.66Q106.08 -5.97 105.41 -5.97Q104.73 -5.97 104.2 -5.66Q103.68 -5.35 103.38 -4.81Q103.08 -4.27 103.08 -3.58Q103.08 -2.88 103.38 -2.33Q103.68 -1.78 104.2 -1.47Q104.73 -1.16 105.41 -1.16Z M115.92 0.15Q115.03 0.15 114.34 -0.25Q113.64 -0.65 113.25 -1.35Q112.86 -2.05 112.86 -2.98V-7.12H114.21V-3.04Q114.21 -2.46 114.41 -2.03Q114.61 -1.6 115 -1.38Q115.39 -1.16 115.92 -1.16Q116.72 -1.16 117.16 -1.66Q117.61 -2.16 117.61 -3.04V-7.12H118.97V-2.98Q118.97 -2.05 118.58 -1.35Q118.19 -0.65 117.5 -0.25Q116.82 0.15 115.92 0.15Z M124.27 0V-10.11H125.62V0ZM122.52 -5.89V-7.12H127.38V-5.89Z  M136.86 0V-10.41H138.27V0ZM137.82 0V-1.29H143.4V0Z M147.31 0V-7.12H148.66V0ZM147.99 -8.55Q147.62 -8.55 147.38 -8.8Q147.13 -9.04 147.13 -9.42Q147.13 -9.78 147.38 -10.03Q147.62 -10.28 147.99 -10.28Q148.37 -10.28 148.61 -10.03Q148.84 -9.78 148.84 -9.42Q148.84 -9.04 148.61 -8.8Q148.37 -8.55 147.99 -8.55Z M153.06 0V-7.12H154.41V0ZM157.88 0V-4.3Q157.88 -5.1 157.39 -5.56Q156.9 -6.01 156.16 -6.01Q155.67 -6.01 155.28 -5.8Q154.89 -5.59 154.65 -5.22Q154.41 -4.84 154.41 -4.32L153.85 -4.59Q153.85 -5.4 154.21 -6Q154.56 -6.6 155.18 -6.94Q155.79 -7.27 156.56 -7.27Q157.31 -7.27 157.91 -6.94Q158.52 -6.61 158.87 -6.01Q159.22 -5.42 159.22 -4.59V0ZM162.69 0V-4.3Q162.69 -5.1 162.2 -5.56Q161.72 -6.01 161 -6.01Q160.5 -6.01 160.1 -5.8Q159.7 -5.59 159.46 -5.22Q159.22 -4.84 159.22 -4.32L158.46 -4.59Q158.5 -5.42 158.9 -6.01Q159.3 -6.6 159.93 -6.94Q160.56 -7.27 161.31 -7.27Q162.09 -7.27 162.7 -6.94Q163.32 -6.61 163.69 -6.01Q164.06 -5.42 164.06 -4.58V0Z M168.3 0V-7.12H169.65V0ZM168.97 -8.55Q168.6 -8.55 168.36 -8.8Q168.12 -9.04 168.12 -9.42Q168.12 -9.78 168.36 -10.03Q168.6 -10.28 168.97 -10.28Q169.35 -10.28 169.59 -10.03Q169.83 -9.78 169.83 -9.42Q169.83 -9.04 169.59 -8.8Q169.35 -8.55 168.97 -8.55Z M175.14 0V-10.11H176.49V0ZM173.38 -5.89V-7.12H178.24V-5.89Z M184.23 0.15Q183.63 0.15 183.1 -0.01Q182.56 -0.16 182.11 -0.46Q181.66 -0.75 181.33 -1.16L182.2 -2.02Q182.59 -1.54 183.1 -1.31Q183.61 -1.08 184.24 -1.08Q184.87 -1.08 185.22 -1.3Q185.56 -1.51 185.56 -1.91Q185.56 -2.29 185.29 -2.51Q185.01 -2.73 184.57 -2.87Q184.14 -3.01 183.65 -3.16Q183.16 -3.3 182.73 -3.52Q182.29 -3.75 182.02 -4.14Q181.74 -4.53 181.74 -5.17Q181.74 -5.82 182.05 -6.29Q182.37 -6.76 182.93 -7.02Q183.49 -7.27 184.29 -7.27Q185.13 -7.27 185.78 -6.98Q186.43 -6.69 186.85 -6.1L185.98 -5.23Q185.68 -5.62 185.24 -5.83Q184.8 -6.04 184.24 -6.04Q183.66 -6.04 183.35 -5.84Q183.04 -5.64 183.04 -5.28Q183.04 -4.92 183.31 -4.72Q183.58 -4.53 184.03 -4.39Q184.47 -4.26 184.95 -4.12Q185.43 -3.97 185.86 -3.73Q186.3 -3.49 186.58 -3.09Q186.85 -2.69 186.85 -2.02Q186.85 -1.02 186.14 -0.43Q185.43 0.15 184.23 0.15Z M191.17 -3.3 190.98 -10.71H192.42L192.22 -3.3ZM191.68 0.15Q191.26 0.15 190.99 -0.14Q190.72 -0.42 190.72 -0.84Q190.72 -1.26 190.99 -1.54Q191.26 -1.81 191.68 -1.81Q192.12 -1.81 192.39 -1.54Q192.66 -1.26 192.66 -0.84Q192.66 -0.42 192.39 -0.14Q192.12 0.15 191.68 0.15Z';

type Props = {
  /** True once the app underneath (fonts etc.) is ready to be revealed. */
  ready: boolean;
  /** Called once the overlay has fully faded out. */
  onFinish: () => void;
  /** Called when the logo has drawn, i.e. when it is safe to hide the native splash. */
  onLogoDrawn: () => void;
};

export const AnimatedSplash: React.FC<Props> = ({ ready, onFinish, onLogoDrawn }) => {
  const overlay = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textLift = useRef(new Animated.Value(8)).current;
  const [holdDone, setHoldDone] = useState(false);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    onLogoDrawn();
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: TEXT_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(textLift, {
          toValue: 0,
          duration: TEXT_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(HOLD_MS),
    ]).start(() => setHoldDone(true));
  }, [onLogoDrawn, textOpacity, textLift]);

  // Safety net: if the image's load event never fires, still proceed.
  useEffect(() => {
    const t = setTimeout(start, 700);
    return () => clearTimeout(t);
  }, [start]);

  // Fade out only when the intro has played AND the app is ready.
  useEffect(() => {
    if (!holdDone || !ready) return;
    Animated.timing(overlay, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => onFinish());
  }, [holdDone, ready, overlay, onFinish]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlay }]}>
      <Image
        source={require('../../assets/splash-icon.png')}
        style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
        resizeMode="contain"
        onLoad={start}
        fadeDuration={0}
      />

      {/* Anchored to the screen centre, so the logo above never shifts. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.textBlock,
          { marginTop: LOGO_BOTTOM + TEXT_GAP, opacity: textOpacity, transform: [{ translateY: textLift }] },
        ]}
      >
        <Svg width={WORDMARK_W} height={WORDMARK_CAP + 6} viewBox={`0 ${-WORDMARK_CAP - 3} ${WORDMARK_W} ${WORDMARK_CAP + 6}`}>
          <Path d={WORDMARK_D} fill={OFF_WHITE} />
        </Svg>
        <View style={{ height: 16 }} />
        <Svg width={TAGLINE_W} height={TAGLINE_CAP + 8} viewBox={`0 ${-TAGLINE_CAP - 2} ${TAGLINE_W} ${TAGLINE_CAP + 8}`}>
          <Path d={TAGLINE_D} fill={OFF_WHITE} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  // Zero-height row at the exact screen centre; marginTop pushes the text
  // below the logo's visible bottom edge.
  textBlock: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
