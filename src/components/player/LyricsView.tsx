import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { useProgress } from '../../hooks/usePlayer';
import { fetchLyrics, LyricsResult } from '../../services/lyrics';
import { Track } from '../../core/types';
import { EdgeFade } from './EdgeFade';
import { activeIndexAt, layersFor, lineDistance, tierIndex, translateFor } from './lyricsMath';

interface LyricsViewProps {
  track: Track;
  duration: number;
  onSeek: (seconds: number) => void;
}

/* ---------------------------------------------------------------------------
 * Look & feel -- every number you might want to tune lives here.
 * ------------------------------------------------------------------------- */
const FONT_SIZE = 28;
const LINE_HEIGHT = 36;
const LINE_GAP = 22;
/** Where the active line's top edge sits, as a fraction of the lyrics area's height. */
const ANCHOR_RATIO = 0.27;
/** Non-active lines are drawn a touch smaller (Apple Music does the same). */
const INACTIVE_SCALE = 0.94;

/**
 * Blur radius (dp) and brightness (0-1) per focus level. Tuned against Apple
 * Music: lines beside the active one are only softly blurred and fairly dim,
 * and each step further out is blurrier and fainter. Blur radii already carry
 * the requested ~5% reduction. Index 0 (active) is sharp and unused here.
 */
const BLUR = [0, 2.3, 3.3, 4.6];
const TIER_OPACITY = [1, 0.47, 0.34, 0.22];
/**
 * Extra room on every side of a blurred line, and how far the lyrics area
 * bleeds past the text column, so the blur spreads out instead of being
 * clipped into a hard vertical edge at the left/right of the text.
 */
const BLEED = SIZES.lg;
const BLUR_PAD = BLEED;
/** Lines dissolve to nothing over this many dp at the top / bottom of the lyrics area. */
const FADE_TOP = 70;
const FADE_BOTTOM = 100;
const PLAIN_FADE_TOP = 40;
const PLAIN_FADE_BOTTOM = 80;

const FOCUS_MS = 380; // sharp <-> blurred crossfade
const SCROLL_MS = 640; // lyrics gliding up to the next line
const SCROLL_EASE = Easing.bezier(0.33, 1, 0.68, 1);

/**
 * Real blur (RenderEffect) needs Android 12+. Older phones get the classic
 * fallback: transparent text with a soft shadow, which renders as blurred text.
 */
const NATIVE_BLUR = Platform.OS !== 'android' || Number(Platform.Version) >= 31;
const blurLayer = (radius: number) => (NATIVE_BLUR ? { filter: [{ blur: radius }] } : null);
const blurText = (radius: number) =>
  NATIVE_BLUR
    ? null
    : ({
        color: 'transparent',
        textShadowColor: 'rgba(255,255,255,0.95)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: radius * 2.2,
      } as const);
const LAYER_STYLE = [1, 2, 3].map((t) => blurLayer(BLUR[t]));
const LAYER_TEXT = [1, 2, 3].map((t) => blurText(BLUR[t]));

/** Soft light behind the active line: one neutral radial gradient, fading to nothing at every edge. */
const GLOW_BASE_H = 100;
const GLOW_PAD_Y = 30;
const GLOW_MOVE_MS = 460;

/* ---------------------------------------------------------------------------
 * One lyric line = a sharp layer plus up to three blurred copies stacked on
 * top of each other. Focus changes crossfade them (opacity only, native
 * driver), so the blur eases in and out instead of popping.
 * ------------------------------------------------------------------------- */
type LineProps = {
  index: number;
  time: number;
  text: string;
  distance: number;
  top: number | undefined;
  height: number | undefined;
  areaHeight: number;
  translate: Animated.Value | Animated.AnimatedMultiplication<number>;
  onSeek: (seconds: number) => void;
  onMeasure: (index: number, y: number, height: number) => void;
};

const LyricLine = memo(function LyricLine({
  index,
  time,
  text,
  distance,
  top,
  height,
  areaHeight,
  translate,
  onSeek,
  onMeasure,
}: LineProps) {
  const tier = tierIndex(distance);
  const layers = layersFor(distance);

  const sharp = useRef(new Animated.Value(tier === 0 ? 1 : 0)).current;
  const tierOp = useRef([0, 1, 2, 3].map((t) => new Animated.Value(t === tier && t > 0 ? TIER_OPACITY[t] : 0))).current;
  const scale = useRef(new Animated.Value(tier === 0 ? 1 : INACTIVE_SCALE)).current;

  useEffect(() => {
    const to = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration: FOCUS_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    const anim = Animated.parallel([
      to(sharp, tier === 0 ? 1 : 0),
      to(tierOp[1], tier === 1 ? TIER_OPACITY[1] : 0),
      to(tierOp[2], tier === 2 ? TIER_OPACITY[2] : 0),
      to(tierOp[3], tier === 3 ? TIER_OPACITY[3] : 0),
      to(scale, tier === 0 ? 1 : INACTIVE_SCALE),
    ]);
    anim.start();
    return () => anim.stop();
  }, [tier, sharp, tierOp, scale]);

  const shown = text || '…';
  const mounted = [false, layers.t1, layers.t2, layers.t3];

  return (
    <Pressable
      onPress={() => onSeek(time)}
      onLayout={(e) => onMeasure(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={styles.linePress}
    >
      <EdgeFade
        translate={translate}
        center={top != null && height != null ? top + height / 2 : undefined}
        areaHeight={areaHeight}
        fadeTop={FADE_TOP}
        fadeBottom={FADE_BOTTOM}
      >
        <Animated.View style={{ transform: [{ scale }], transformOrigin: 'left center' }}>
          {/* Sharp layer: also what gives the line its size. */}
          <Animated.Text style={[styles.lineText, { opacity: sharp }]}>{shown}</Animated.Text>

          {[1, 2, 3].map(
            (t) =>
              mounted[t] && (
                <Animated.View
                  key={t}
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.blurLayer, LAYER_STYLE[t - 1], { opacity: tierOp[t] }]}
                >
                  <Text style={[styles.lineText, LAYER_TEXT[t - 1]]}>{shown}</Text>
                </Animated.View>
              )
          )}
        </Animated.View>
      </EdgeFade>
    </Pressable>
  );
});

/**
 * Lyrics for Now Playing, Apple Music style.
 *
 * Time-synced lyrics: only the line at the current timestamp is sharp; every
 * other line is blurred (more so the further away). The user cannot scroll --
 * the lyrics glide by themselves. Tapping a line still seeks to it.
 * Lyrics without timestamps are shown as plain, unblurred, scrollable text.
 * Both fade out softly at the top and bottom edge.
 */
export const LyricsView: React.FC<LyricsViewProps> = ({ track, duration, onSeek }) => {
  const { position } = useProgress();
  const [state, setState] = useState<LyricsResult & { loading: boolean }>({
    loading: true,
    synced: null,
    plain: null,
  });
  const [areaHeight, setAreaHeight] = useState(0);
  /** Bumped (debounced) when line layouts arrive/change so scroll, glow and fades catch up. */
  const [layoutTick, setLayoutTick] = useState(0);
  const [placedReady, setPlacedReady] = useState(false);

  const lineTops = useRef<number[]>([]);
  const lineHeights = useRef<number[]>([]);
  const placed = useRef(false);
  const glowPlaced = useRef(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contentY = useRef(new Animated.Value(0)).current;
  // Plain lyrics scroll natively; this is their scroll offset, and its negation is
  // "how far the content has moved", the same quantity contentY is for synced lyrics.
  const scrollY = useRef(new Animated.Value(0)).current;
  const plainTranslate = useRef(Animated.multiply(scrollY, -1)).current;
  const glowY = useRef(new Animated.Value(0)).current;
  const glowScaleY = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, synced: null, plain: null });
    lineTops.current = [];
    lineHeights.current = [];
    placed.current = false;
    glowPlaced.current = false;
    glowOpacity.setValue(0);
    scrollY.setValue(0);
    setPlacedReady(false);
    fetchLyrics({ title: track.title, artist: track.artist.name, album: track.album, duration }).then((res) => {
      if (!cancelled) setState({ loading: false, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [track.id, duration]);

  const activeIndex = useMemo(
    () => (state.synced ? activeIndexAt(state.synced, position) : -1),
    [state.synced, position]
  );
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const handleMeasure = useRef((index: number, y: number, height: number) => {
    if (lineTops.current[index] === y && lineHeights.current[index] === height) return;
    lineTops.current[index] = y;
    lineHeights.current[index] = height;
    // Lines report one after another on first layout: batch them into one update.
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setLayoutTick((t) => t + 1), 24);
  }).current;

  useEffect(
    () => () => {
      if (tickTimer.current) clearTimeout(tickTimer.current);
    },
    []
  );

  // Glide the lyrics so the active line sits at the anchor (before the first
  // line, line 0 sits there). The user never scrolls; this is the only motion.
  useEffect(() => {
    if (!state.synced || !areaHeight) return;
    const top = lineTops.current[Math.max(activeIndex, 0)];
    if (top == null) return;
    const target = translateFor(top, areaHeight * ANCHOR_RATIO);
    if (!placed.current) {
      placed.current = true;
      contentY.setValue(target); // first placement: no flight from the top
      setPlacedReady(true);
      return;
    }
    const anim = Animated.timing(contentY, {
      toValue: target,
      duration: SCROLL_MS,
      easing: SCROLL_EASE,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [activeIndex, areaHeight, layoutTick, state.synced, contentY]);

  // Move the soft light to the active line. It lives inside the gliding
  // content, so it travels with the lyrics; this only animates line-to-line hops.
  useEffect(() => {
    const y = lineTops.current[activeIndex];
    const h = lineHeights.current[activeIndex];
    if (activeIndex < 0 || y == null || h == null) {
      Animated.timing(glowOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      return;
    }
    const centerY = y + h / 2;
    const scaleY = (h + GLOW_PAD_Y * 2) / GLOW_BASE_H;
    if (!glowPlaced.current) {
      glowPlaced.current = true;
      glowY.setValue(centerY);
      glowScaleY.setValue(scaleY);
      Animated.timing(glowOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      return;
    }
    const ease = Easing.inOut(Easing.cubic);
    Animated.parallel([
      Animated.timing(glowY, { toValue: centerY, duration: GLOW_MOVE_MS, easing: ease, useNativeDriver: true }),
      Animated.timing(glowScaleY, { toValue: scaleY, duration: GLOW_MOVE_MS, easing: ease, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [activeIndex, layoutTick, glowY, glowScaleY, glowOpacity]);

  if (state.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.text.primary} />
      </View>
    );
  }

  if (!state.synced && !state.plain) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Oops,you made my lyrics blush!</Text>
      </View>
    );
  }

  // No timestamps: nothing to focus on, so show it plainly and let it scroll.
  if (!state.synced) {
    return (
      <View style={styles.viewport} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          style={styles.plainScroll}
          contentContainerStyle={styles.plainContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        >
          {state.plain!.map((line, i) => (
            <View
              key={i}
              onLayout={(e) => handleMeasure(i, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
            >
              <EdgeFade
                translate={plainTranslate}
                center={
                  lineTops.current[i] != null ? lineTops.current[i] + (lineHeights.current[i] ?? 0) / 2 : undefined
                }
                areaHeight={areaHeight}
                fadeTop={PLAIN_FADE_TOP}
                fadeBottom={PLAIN_FADE_BOTTOM}
              >
                <Text style={styles.plainLine}>{line}</Text>
              </EdgeFade>
            </View>
          ))}
        </Animated.ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.viewport} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
      <Animated.View
        style={[styles.content, { opacity: placedReady ? 1 : 0, transform: [{ translateY: contentY }] }]}
      >
        {/* Diffused light behind the active line; drawn first so text sits on top. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            { opacity: glowOpacity, transform: [{ translateY: glowY }, { scaleY: glowScaleY }] },
          ]}
        >
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="lyricGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.11} />
                <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.055} />
                <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0.02} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#lyricGlow)" />
          </Svg>
        </Animated.View>

        {state.synced.map((line, i) => (
          <LyricLine
            key={`${track.id}:${i}`}
            index={i}
            time={line.time}
            text={line.text}
            distance={lineDistance(i, activeIndex)}
            top={lineTops.current[i]}
            height={lineHeights.current[i]}
            areaHeight={areaHeight}
            translate={contentY}
            onSeek={onSeek}
            onMeasure={handleMeasure}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.xl,
  },
  emptyTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  // ---- plain (no timestamps) ----
  plainScroll: { flex: 1 },
  // The area bleeds BLEED past the text column on both sides; this padding puts
  // the text back on the same left edge as the header and seek bar.
  plainContent: { paddingTop: 44, paddingBottom: 88, paddingHorizontal: BLEED },
  plainLine: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    lineHeight: 34,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: SIZES.smd,
    textAlign: 'left',
  },
  // ---- synced ----
  viewport: { flex: 1, overflow: 'hidden', marginHorizontal: -BLEED },
  // Taller than the viewport on purpose; it is slid up and down by translateY.
  content: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: BLEED },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -GLOW_BASE_H / 2,
    height: GLOW_BASE_H,
  },
  linePress: { marginBottom: LINE_GAP },
  lineText: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: COLORS.text.primary,
    textAlign: 'left',
  },
  blurLayer: {
    position: 'absolute',
    top: -BLUR_PAD,
    left: -BLUR_PAD,
    right: -BLUR_PAD,
    bottom: -BLUR_PAD,
    padding: BLUR_PAD,
  },
});
