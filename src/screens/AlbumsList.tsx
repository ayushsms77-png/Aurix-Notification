import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { useLibrary } from '../hooks/useLibrary';

export default function AlbumsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { liked, playlists, recentlyPlayed } = useLibrary();

  const albums = useMemo(() => {
    const tracks = [...liked, ...playlists.flatMap((p) => p.tracks), ...recentlyPlayed];
    const map = new Map<string, { name: string; artist: string; image: string; count: number }>();
    for (const t of tracks) {
      if (!t.album) continue;
      const a = map.get(t.album);
      if (a) a.count++;
      else map.set(t.album, { name: t.album, artist: t.artist.name, image: t.albumImageUrl, count: 1 });
    }
    return [...map.values()].sort((x, y) => y.count - x.count);
  }, [liked, playlists, recentlyPlayed]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SIZES.xl }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeft color={COLORS.text.primary} size={26} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Albums</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SIZES.xxl }]}>
        {albums.length ? (
          albums.map((album) => (
            <View key={album.name} style={styles.row}>
              <Image source={{ uri: album.image }} style={styles.image} />
              <View style={styles.info}>
                <Text style={styles.title}>{album.name}</Text>
                <Text style={styles.subtitle}>{album.artist}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyHint}>Albums appear here as you save music.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingBottom: SIZES.md },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  scrollContent: { paddingHorizontal: SIZES.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.md },
  image: { width: 64, height: 64, borderRadius: SIZES.radius.sm, backgroundColor: COLORS.surfaceLight },
  info: { flex: 1, marginLeft: SIZES.md, justifyContent: 'center' },
  title: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary, marginBottom: 4 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.secondary },
  emptyHint: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.muted, paddingVertical: SIZES.sm },
});
