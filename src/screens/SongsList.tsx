import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { TrackRow } from '../components/lists/TrackRow';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';

export default function SongsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { liked, playlists } = useLibrary();
  const { playTrack, currentTrack, isPlaying, isLoading } = usePlayer();

  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  // Every track the user has ever saved (liked or filed into a playlist),
  // deduped by id — this is the "Songs" flat view, distinct from Playlists.
  const songs = useMemo(() => {
    const seen = new Map<string, Track>();
    for (const t of [...liked, ...playlists.flatMap((p) => p.tracks)]) {
      if (!seen.has(t.id)) seen.set(t.id, t);
    }
    return [...seen.values()];
  }, [liked, playlists]);

  const onTrackPress = useCallback(
    (track: Track) => playTrack(track, { tracks: songs, label: 'Songs' }),
    [playTrack, songs]
  );

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
        <Text style={styles.headerTitle}>Songs</Text>
      </View>

      <FlatList
        data={songs}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SIZES.xxl }]}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            onPress={onTrackPress}
            isPlaying={isPlaying && currentTrack?.id === item.id}
            isLoading={isLoading && currentTrack?.id === item.id}
            onMorePress={setAddingTrack}
          />
        )}
        ListEmptyComponent={<Text style={styles.emptyHint}>Songs appear here as you save music.</Text>}
      />

      <AddToPlaylistSheet track={addingTrack} onClose={() => setAddingTrack(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingBottom: SIZES.md },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  scrollContent: { paddingHorizontal: SIZES.md },
  emptyHint: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.muted,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
  },
});
