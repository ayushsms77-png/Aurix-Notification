import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { Play, Pause, SkipForward } from 'lucide-react-native';
import { Track } from '../../core/types';
import { useProgress } from '../../hooks/usePlayer';
import { COLORS, SIZES, FONTS } from '../../constants/theme';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPress: () => void;
  onPlayPause: () => void;
  /** Skip to the next queued track — Aurix's mini player always shows this. */
  onNext: () => void;
  tabBarHeight?: number;
  isLoading?: boolean;
}

/** Only this subtree subscribes to playback position — see note below. */
const MiniPlayerProgress: React.FC = React.memo(() => {
  const { position, duration } = useProgress();
  const pct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
});
MiniPlayerProgress.displayName = 'MiniPlayerProgress';

/** Scrolling title, matching Aurix's MarqueeTitle — only animates if the text overflows. */
const MarqueeTitle: React.FC<{ text: string }> = ({ text }) => {
  const [overflow, setOverflow] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (containerWidth > 0 && textWidth > containerWidth) setOverflow(true);
    else setOverflow(false);
  }, [containerWidth, textWidth]);

  useEffect(() => {
    if (!overflow) {
      anim.setValue(0);
      return;
    }
    const distance = textWidth + 40; // gap between repeats
    const duration = Math.max(6000, text.length * 250);
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: -distance,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [overflow, textWidth, text, anim]);

  return (
    <View
      style={styles.marqueeClip}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.marqueeRow, overflow && { transform: [{ translateX: anim }] }]}>
        <Text
          style={styles.title}
          numberOfLines={1}
          onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
        {overflow && (
          <Text style={[styles.title, styles.marqueeSpacer]} numberOfLines={1}>
            {text}
          </Text>
        )}
      </Animated.View>
    </View>
  );
};

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  onPress,
  onPlayPause,
  onNext,
  tabBarHeight = Platform.OS === 'ios' ? 80 : 60,
  isLoading = false,
}) => {
  if (!track) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={[styles.positionContainer, { bottom: tabBarHeight }]}
    >
      <View style={styles.container}>
        <MiniPlayerProgress />

        <View style={styles.content}>
          <Image
            source={{ uri: track.albumImageUrl }}
            style={styles.image}
            resizeMode="cover"
          />

          <View style={styles.infoContainer}>
            <MarqueeTitle text={track.title} />
            <Text style={styles.artist} numberOfLines={1}>
              {isLoading ? 'Loading…' : track.artist.name}
            </Text>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation();
                if (!isLoading) onPlayPause();
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.text.primary} />
              ) : isPlaying ? (
                <Pause color={COLORS.text.primary} size={20} fill={COLORS.text.primary} />
              ) : (
                <Play color={COLORS.text.primary} size={20} fill={COLORS.text.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={(e) => {
                e.stopPropagation();
                onNext();
              }}
            >
              <SkipForward color="rgba(255,255,255,0.85)" size={19} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  positionContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  container: {
    backgroundColor: COLORS.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.hairline,
    // Full-width, square — no side margins or rounded corners, per Aurix.
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.10)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent.green,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    height: 64,
  },
  image: {
    width: 46,
    height: 46,
    borderRadius: 11,
    backgroundColor: COLORS.surfaceLight,
  },
  infoContainer: {
    flex: 1,
    marginLeft: SIZES.smd,
    justifyContent: 'center',
  },
  marqueeClip: {
    overflow: 'hidden',
  },
  marqueeRow: {
    flexDirection: 'row',
  },
  marqueeSpacer: {
    marginLeft: 40,
  },
  title: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.text.primary,
  },
  artist: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
