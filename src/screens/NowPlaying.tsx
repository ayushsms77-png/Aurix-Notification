import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Animated,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Heart,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  ListMusic,
  ListPlus,
  MessageCircle,
  Download,
  Check,
} from 'lucide-react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { ArtworkBackground } from '../components/player/ArtworkBackground';
import { QueueSheet } from '../components/player/QueueSheet';
import { SeekBar } from '../components/player/SeekBar';
import { LyricsView } from '../components/player/LyricsView';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';
import { DownloadService } from '../services/DownloadService';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

/**
 * "Aurix" with a subtle left-to-right light sweep -- used ONLY as the
 * Lyrics-view header centerpiece (no glow/shadow, no plain "Aurix" text
 * anywhere else in the app). Built from per-letter opacity, staggered
 * left-to-right, rather than a glow/shadow -- much closer to "letters
 * light up" than a pulsing halo.
 */
const GlowingWordmark: React.FC = () => {
  const letters = 'Aurix'.split('');
  const anims = useRef(letters.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const stagger = 90;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.stagger(
          stagger,
          anims.map((v) =>
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }),
              Animated.timing(v, { toValue: 0, duration: 420, useNativeDriver: true }),
            ])
          )
        ),
        Animated.delay(900),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.glowRow}>
      {letters.map((ch, i) => (
        <Animated.Text
          key={i}
          style={[
            styles.glowWordmark,
            {
              opacity: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] }),
            },
          ]}
        >
          {ch}
        </Animated.Text>
      ))}
    </View>
  );
};

export default function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    isLoading,
    isBuffering,
    error,
    retry,
    seekTo,
    duration,
    next,
    previous,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    upcoming,
    jumpTo,
    removeFromQueue,
    reorderUpcoming,
  } = usePlayer();

  const { isLiked, toggleLike } = useLibrary();
  const [view, setView] = useState<'player' | 'lyrics'>('player');
  const [showQueue, setShowQueue] = useState(false);
  /** Track whose "add to playlist" sheet is open. */
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  // Live download status for the current track, same pattern as TrackRow.
  const [downloaded, setDownloaded] = useState(
    () => !!currentTrack && DownloadService.isDownloaded(currentTrack.id)
  );
  const [downloadProgress, setDownloadProgress] = useState<number | undefined>(
    () => currentTrack ? DownloadService.getProgress(currentTrack.id) : undefined
  );

  useEffect(() => {
    if (!currentTrack) return;
    const sync = () => {
      setDownloaded(DownloadService.isDownloaded(currentTrack.id));
      setDownloadProgress(DownloadService.getProgress(currentTrack.id));
    };
    sync();
    return DownloadService.subscribe(sync);
  }, [currentTrack?.id]);

  const handleDownloadPress = useCallback(() => {
    if (!currentTrack || downloaded || downloadProgress !== undefined) return;
    void DownloadService.startDownload(currentTrack);
  }, [currentTrack, downloaded, downloadProgress]);

  /** Drag-release commit from the queue sheet -> real playback order. */
  const handleReorder = useCallback(
    (ids: string[]) => {
      reorderUpcoming(ids);
    },
    [reorderUpcoming]
  );

  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);
  const busy = isLoading || isBuffering;

  return (
    <View style={styles.container}>
      {/* Dynamic per-album colour background (Apple-style) */}
      <ArtworkBackground uri={currentTrack.albumImageUrl} />

      <View style={[styles.content, { paddingTop: insets.top + SIZES.xl, paddingBottom: insets.bottom + SIZES.md }]}>

        {/* Decluttered Apple-style header — no "PLAYING FROM" */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
            <ChevronDown color={COLORS.text.primary} size={28} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {view === 'lyrics' && <GlowingWordmark />}
          </View>
          <TouchableOpacity style={styles.headerIcon} onPress={() => setAddingTrack(currentTrack)}>
            <ListPlus color={COLORS.text.primary} size={24} />
          </TouchableOpacity>
        </View>

        {view === 'player' ? (
          <>
            <View style={styles.artworkContainer}>
              <Image source={{ uri: currentTrack.albumImageUrl }} style={styles.artwork} />
            </View>

            <View style={styles.infoContainer}>
              <View style={styles.textInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{currentTrack.title}</Text>
                <Text style={styles.trackArtist} numberOfLines={1}>{currentTrack.artist.name}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleLike(currentTrack)}>
                <Heart
                  color={liked ? COLORS.accent.green : COLORS.text.primary}
                  fill={liked ? COLORS.accent.green : 'transparent'}
                  size={28}
                />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.lyricsWrap}>
            <LyricsView track={currentTrack} duration={duration} onSeek={seekTo} />
          </View>
        )}

        <SeekBar onSeek={seekTo} />

        {/* Error state -- never leaves the player stuck */}
        {error && (
          <TouchableOpacity activeOpacity={0.8} onPress={retry} style={styles.errorBanner}>
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            <Text style={styles.errorHint}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* Main transport controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity onPress={toggleShuffle}>
            <Shuffle color={shuffle ? COLORS.accent.green : COLORS.text.secondary} size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={previous}>
            <SkipBack color={COLORS.text.primary} size={32} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
            {busy ? (
              <ActivityIndicator color={COLORS.background} />
            ) : isPlaying ? (
              <Pause color={COLORS.background} size={32} fill={COLORS.background} />
            ) : (
              <Play color={COLORS.background} size={32} fill={COLORS.background} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={next}>
            <SkipForward color={COLORS.text.primary} size={32} />
          </TouchableOpacity>
          <TouchableOpacity onPress={cycleRepeat}>
            {repeat === 'one' ? (
              <Repeat1 color={COLORS.accent.green} size={24} />
            ) : (
              <Repeat color={repeat === 'all' ? COLORS.accent.green : COLORS.text.secondary} size={24} />
            )}
          </TouchableOpacity>
        </View>

        {/* Secondary row — Lyrics / Queue / Download */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setView((v) => (v === 'lyrics' ? 'player' : 'lyrics'))}
          >
            <MessageCircle
              color={view === 'lyrics' ? COLORS.accent.green : COLORS.text.secondary}
              fill={view === 'lyrics' ? COLORS.accent.green : 'transparent'}
              size={20}
            />
            <Text style={[styles.secondaryLabel, view === 'lyrics' && styles.secondaryLabelActive]}>
              Lyrics
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowQueue(true)}>
            <ListMusic color={COLORS.text.secondary} size={20} />
            <Text style={styles.secondaryLabel}>Queue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleDownloadPress}
            disabled={downloadProgress !== undefined}
          >
            {downloadProgress !== undefined ? (
              <ActivityIndicator size="small" color={COLORS.text.secondary} />
            ) : downloaded ? (
              <Check color={COLORS.accent.green} size={20} />
            ) : (
              <Download color={COLORS.text.secondary} size={20} />
            )}
            <Text style={[styles.secondaryLabel, downloaded && styles.secondaryLabelActive]}>
              {downloadProgress !== undefined ? 'Downloading' : downloaded ? 'Downloaded' : 'Download'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Drag-to-reorder queue sheet (Image 4 design) */}
      <QueueSheet
        visible={showQueue}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        upcoming={upcoming}
        onClose={() => setShowQueue(false)}
        onJump={(id) => {
          jumpTo(id);
          setShowQueue(false);
        }}
        onRemove={removeFromQueue}
        onReorder={handleReorder}
      />

      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />
          </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: SIZES.lg, justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.lg },
  headerIcon: { padding: SIZES.xs },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glowRow: { flexDirection: 'row' },
  glowWordmark: {
    fontFamily: FONTS.extrabold,
    fontSize: 19,
    color: COLORS.text.primary,
    letterSpacing: 0.5,
  },
  artworkContainer: {
    width: width - SIZES.lg * 2,
    height: width - SIZES.lg * 2,
    borderRadius: SIZES.radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    marginBottom: SIZES.xl,
  },
  artwork: { width: '100%', height: '100%' },
  infoContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.lg },
  textInfo: { flex: 1, paddingRight: SIZES.md },
  trackTitle: { fontFamily: FONTS.medium, fontSize: 24, color: COLORS.text.primary, marginBottom: 4 },
  trackArtist: { fontFamily: FONTS.regular, fontSize: 16, color: COLORS.text.secondary },
  lyricsWrap: { flex: 1, marginBottom: SIZES.md },
  controlsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.xl, paddingHorizontal: SIZES.sm },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.text.primary, justifyContent: 'center', alignItems: 'center' },
  bottomActions: { flexDirection: 'row', alignItems: 'center' },
  secondaryButton: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: SIZES.xs },
  secondaryLabel: { fontFamily: FONTS.semibold, fontSize: 10, color: 'rgba(255,255,255,0.55)' },
  secondaryLabelActive: { color: COLORS.accent.green },
  errorBanner: { backgroundColor: COLORS.accent.redGlow, borderRadius: SIZES.radius.sm, borderWidth: 1, borderColor: COLORS.accent.red, padding: SIZES.sm, marginBottom: SIZES.md },
  errorText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text.primary },
  errorHint: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.text.secondary, marginTop: 2 },
});
