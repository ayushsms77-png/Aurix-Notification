import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, synced: null, plain: null });
    lineOffsets.current = [];
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

  // Center the active line, unless the user is actively scrolling it themselves.
  useEffect(() => {
    if (userScrolling || activeIndex < 0 || !containerHeight) return;
    const offset = lineOffsets.current[activeIndex];
    if (offset == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - containerHeight / 2), animated: true });
  }, [activeIndex, userScrolling, containerHeight]);

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
