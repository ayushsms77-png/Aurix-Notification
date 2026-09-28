import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CloudOff } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { Track } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { DownloadService } from '../services/DownloadService';
import { TrackRow } from '../components/lists/TrackRow';
import { MiniPlayer } from '../components/player/MiniPlayer';
import { AddToPlaylistSheet } from '../components/lists/AddToPlaylistSheet';

export default function DownloadedMusicScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { playTrack, currentTrack, isPlaying, isLoading, togglePlayPause, next } = usePlayer();

  const [tracks, setTracks] = useState<Track[]>(() => DownloadService.getDownloaded());

  useEffect(() => {
    // DownloadService loads lazily; refresh once its startup load lands, then
    // stay live for anything downloaded/removed while this screen is open.
    void DownloadService.load().then(() => setTracks(DownloadService.getDownloaded()));
    return DownloadService.subscribe(() => setTracks(DownloadService.getDownloaded()));
  }, []);

  const [addingTrack, setAddingTrack] = useState<Track | null>(null);

  const playFrom = (track: Track) => playTrack(track, { tracks, label: 'Downloaded Music' });

  const removeDownload = useCallback((track: Track) => {
    void DownloadService.deleteDownload(track.id);
  }, []);

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
        <Text style={styles.headerTitle}>Downloaded Music</Text>
      </View>

      {tracks.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.iconCircle}>
            <CloudOff color={COLORS.text.muted} size={32} />
          </View>
          <Text style={styles.emptyTitle}>No offline downloads</Text>
          <Text style={styles.emptySubtitle}>
            Download a song from its menu to play it here without an internet connection.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPress={playFrom}
              onMorePress={setAddingTrack}
              isPlaying={currentTrack?.id === track.id && isPlaying}
            />
          ))}
        </View>
      )}

      <AddToPlaylistSheet
        track={addingTrack}
        onClose={() => setAddingTrack(null)}
        onDelete={removeDownload}
      />

      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={togglePlayPause}
          onNext={next}
          onPress={() => navigation.navigate('NowPlaying' as never)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingBottom: SIZES.md },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  list: { paddingBottom: SIZES.bottomInset },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: SIZES.xxxl, paddingHorizontal: SIZES.xl, gap: SIZES.md },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.text.primary },
  emptySubtitle: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 20 },
});
