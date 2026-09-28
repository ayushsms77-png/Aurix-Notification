import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';
import { ArtworkPalette, extractArtworkColors } from '../../utils/artworkColors';

/**
 * Apple Music-style dynamic background: the album art itself, heavily blurred
 * and scaled past the screen edges, topped with a colour wash derived from the
 * art's own dominant/vibrant colours. If extraction fails (webp, offline...)
 * we gracefully fall back to a neutral dark gradient — never a broken player.
 */
export const ArtworkBackground: React.FC<{ uri: string }> = ({ uri }) => {
  const [palette, setPalette] = useState<ArtworkPalette | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    fade.setValue(0);
    setPalette(null);
    extractArtworkColors(uri).then((p) => {
      if (!alive) return;
      setPalette(p);
      if (p) {
        Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={{ uri }} style={styles.blurArt} blurRadius={70} resizeMode="cover" />

      {palette ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <LinearGradient
            colors={[`${palette.vibrant}66`, `${palette.dominant}99`, COLORS.background]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : (
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.30)', 'rgba(10, 10, 10, 0.85)', COLORS.background]}
          locations={[0, 0.5, 0.9]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Readability vignette: top icons + bottom controls stay legible over any artwork. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  blurArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Scale past the edges so the blur never shows soft borders.
    transform: [{ scale: 1.25 }],
  },
});
