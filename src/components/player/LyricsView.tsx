import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { useProgress } from '../../hooks/usePlayer';
import { fetchLyrics, LyricsResult } from '../../services/lyrics';
import { Track } from '../../core/types';

interface LyricsViewProps {
  track: Track;
  duration: number;
  onSeek: (seconds: number) => void;
}

/**
 * Soft light behind the active line (Apple Music style). One neutral-white
 * radial gradient -- no tint -- fading to fully transparent at every edge, so
 * there is no visible box. The text is drawn on top of it and stays sharp;
 * nothing is blurred.
 */
const GLOW_BASE_H = 100; // the glow view's own height; scaled to fit each line
const GLOW_PAD_Y = 30; // how far the light reaches above/below the line
const GLOW_BLEED_X = 0; // spans the lyrics column; fades to 0 before either edge
const GLOW_MOVE_MS = 460;
const GLOW_PEAK_OPACITY = 1;

/**
 * Renders inside NowPlaying when the "Lyrics" tab is active — ported from
 * Aurix's LyricsView.jsx. RN has no scrollIntoView, so centering is done by
 * measuring each line's y-offset on layout and calling scrollTo() directly,
 * which is the same "measure, don't rely on the browser" approach the
 * original component's comment already called for.
 */
export const LyricsView: React.FC<LyricsViewProps> = ({ track, duration, onSeek }) => {
  const { position } = useProgress();
  const [state, setState] = useState<LyricsResult & { loading: boolean }>({
    loading: true,
    synced: null,
    plain: null,
  });
  const [containerHeight, setContainerHeight] = useState(0);
  const [userScrolling, setUserScrolling] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<number[]>([]);
  const lineHeights = useRef<number[]>([]);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped when the ACTIVE line's layout arrives late, so glow + scroll can catch up. */
  const [layoutTick, setLayoutTick] = useState(0);
  const activeIndexRef = useRef(-1);

  // Glow: position (centre of the active line) and size, on the native driver.
  const glowY = useRef(new Animated.Value(0)).current;
  const glowScaleY = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowPlaced = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, synced: null, plain: null });
    lineOffsets.current = [];
    lineHeights.current = [];
    glowPlaced.current = false;
    glowOpacity.setValue(0);
    fetchLyrics({ title: track.title, artist: track.artist.name, album: track.album, duration }).then((res) => {
      if (!cancelled) setState({ loading: false, ...res });
    });
    return () => {
      cancelled = true;
    };
  }, [track.id, duration]);

  const activeIndex = useMemo(() => {
    if (!state.synced) return -1;
    let idx = -1;
    for (let i = 0; i < state.synced.length; i++) {
      if (state.synced[i].time <= position) idx = i;
      else break;
    }
    return idx;
  }, [state.synced, position]);

  activeIndexRef.current = activeIndex;

  // Center the active line, unless the user is actively scrolling it themselves.
  useEffect(() => {
    if (userScrolling || activeIndex < 0 || !containerHeight) return;
    const offset = lineOffsets.current[activeIndex];
    if (offset == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - containerHeight / 2), animated: true });
  }, [activeIndex, userScrolling, containerHeight, layoutTick]);

  // Glide the light to the active line. It sits INSIDE the scroll content, so
  // while the lyrics scroll it moves with them (no lag, no separate tracking);
  // this only animates the hop from one line to the next.
  useEffect(() => {
    const y = lineOffsets.current[activeIndex];
    const h = lineHeights.current[activeIndex];
    if (activeIndex < 0 || y == null || h == null) {
      Animated.timing(glowOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      return;
    }
    const centerY = y + h / 2;
    const scaleY = (h + GLOW_PAD_Y * 2) / GLOW_BASE_H;
    if (!glowPlaced.current) {
      // First placement: appear in position, then fade in (don't fly in from the top).
      glowPlaced.current = true;
      glowY.setValue(centerY);
      glowScaleY.setValue(scaleY);
      Animated.timing(glowOpacity, { toValue: GLOW_PEAK_OPACITY, duration: 500, useNativeDriver: true }).start();
      return;
    }
    const ease = Easing.inOut(Easing.cubic);
    Animated.parallel([
      Animated.timing(glowY, { toValue: centerY, duration: GLOW_MOVE_MS, easing: ease, useNativeDriver: true }),
      Animated.timing(glowScaleY, { toValue: scaleY, duration: GLOW_MOVE_MS, easing: ease, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: GLOW_PEAK_OPACITY, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [activeIndex, layoutTick, glowY, glowScaleY, glowOpacity]);

  const handleManualScroll = () => {
    setUserScrolling(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setUserScrolling(false), 3000);
  };

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

  if (!state.synced) {
    return (
      <ScrollView style={styles.plainScroll} contentContainerStyle={styles.plainContent}>
        {state.plain!.map((line, i) => (
          <Text key={i} style={styles.plainLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.syncedScroll}
      contentContainerStyle={styles.syncedContent}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
      onScrollBeginDrag={handleManualScroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Diffused light behind the active line -- drawn first so text sits on top. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: glowOpacity,
            transform: [{ translateY: glowY }, { scaleY: glowScaleY }],
          },
        ]}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="lyricGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.07} />
              <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0.025} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#lyricGlow)" />
        </Svg>
      </Animated.View>

      {state.synced.map((line, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <TouchableOpacity
            key={i}
            activeOpacity={0.7}
            onPress={() => onSeek(line.time)}
            onLayout={(e) => {
              lineOffsets.current[i] = e.nativeEvent.layout.y;
              lineHeights.current[i] = e.nativeEvent.layout.height;
              // The active line may be measured after it became active.
              if (i === activeIndexRef.current) setLayoutTick((t) => t + 1);
            }}
          >
            <Text
              style={[
                styles.syncedLine,
                isActive ? styles.syncedLineActive : isPast ? styles.syncedLinePast : styles.syncedLineFuture,
              ]}
            >
              {line.text || '…'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
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
  emptySubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },
  plainScroll: { flex: 1 },
  plainContent: { paddingHorizontal: SIZES.lg, paddingVertical: SIZES.lg },
  plainLine: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 30,
    marginBottom: SIZES.xs,
  },
  syncedScroll: { flex: 1 },
  // Centred on translateY (its middle sits on the active line's middle) and
  // wider than the text column so the light fades out before any edge.
  glow: {
    position: 'absolute',
    left: -GLOW_BLEED_X,
    right: -GLOW_BLEED_X,
    top: -GLOW_BASE_H / 2,
    height: GLOW_BASE_H,
  },
  syncedContent: { paddingHorizontal: SIZES.lg, paddingVertical: SIZES.xxxl },
  syncedLine: {
    fontFamily: FONTS.bold,
    lineHeight: 30,
    marginBottom: SIZES.md,
  },
  syncedLineActive: {
    fontSize: 24,
    fontFamily: FONTS.extrabold,
    color: COLORS.text.primary,
  },
  syncedLinePast: {
    fontSize: 19,
    color: 'rgba(255,255,255,0.35)',
  },
  syncedLineFuture: {
    fontSize: 19,
    color: 'rgba(255,255,255,0.45)',
  },
});
