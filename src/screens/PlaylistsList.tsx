import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, Trash2, X, Heart } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import { GlassCard } from '../components/common/GlassCard';
import { Playlist } from '../core/types';
import { usePlayer } from '../hooks/usePlayer';
import { useLibrary } from '../hooks/useLibrary';

type StackParams = { Playlist: { playlistId: string } };

/**
 * Full playlist browser, reached from Library's "Playlists" row.
 * Create/import — previously the inline panel at the top of the old
 * single-screen Library — lives here now, next to the list it fills.
 */
export default function PlaylistsListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { playTrack } = usePlayer();
  const {
    playlists,
    likedPlaylist,
    importPlaylist,
    importing,
    importError,
    clearImportError,
    deletePlaylist,
    touchPlaylist,
    createPlaylist,
  } = useLibrary();

  const [showCreate, setShowCreate] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const allPlaylists = useMemo<Playlist[]>(
    () => [
      likedPlaylist,
      ...[...playlists].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    ],
    [likedPlaylist, playlists]
  );

  const openPlaylist = useCallback(
    (playlist: Playlist) => {
      touchPlaylist(playlist.id);
      navigation.navigate('Playlist', { playlistId: playlist.id });
    },
    [navigation, touchPlaylist]
  );

  const onPlayPlaylist = (playlist: Playlist) => {
    if (!playlist.tracks.length) return;
    playTrack(playlist.tracks[0], { tracks: playlist.tracks, label: playlist.name });
  };

  const onCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const playlist = createPlaylist(name);
    setNewPlaylistName('');
    setShowCreate(false);
    Keyboard.dismiss();
    navigation.navigate('Playlist', { playlistId: playlist.id });
  };

  const onImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    try {
      await importPlaylist(url);
      setImportUrl('');
      setShowCreate(false);
    } catch {
      // importError renders inline below.
    }
  };

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
        <Text style={styles.headerTitle}>Playlists</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setShowCreate((v) => !v);
            clearImportError();
          }}
        >
          {showCreate ? (
            <X color={COLORS.text.primary} size={22} />
          ) : (
            <Plus color={COLORS.text.primary} size={22} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + SIZES.xxl }]}
      >
        {showCreate && (
          <GlassCard intensity={20} style={styles.importCard}>
            <Text style={styles.importTitle}>New playlist</Text>
            <View style={styles.importRow}>
              <TextInput
                style={styles.importInput}
                placeholder="Playlist name"
                placeholderTextColor={COLORS.text.muted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                onSubmitEditing={onCreatePlaylist}
                returnKeyType="done"
                maxLength={60}
              />
              <TouchableOpacity
                style={[styles.importButton, !newPlaylistName.trim() && styles.importButtonDisabled]}
                onPress={onCreatePlaylist}
                disabled={!newPlaylistName.trim()}
              >
                <Text style={styles.importButtonText}>Create</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panelDivider} />

            <Text style={styles.importTitle}>Import a public playlist</Text>
            <View style={styles.importRow}>
              <TextInput
                style={styles.importInput}
                placeholder="Paste a playlist or album link"
                placeholderTextColor={COLORS.text.muted}
                value={importUrl}
                onChangeText={setImportUrl}
                onSubmitEditing={onImport}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.importButton} onPress={onImport} disabled={importing}>
                {importing ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.importButtonText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
            {importError && <Text style={styles.importError}>{importError}</Text>}
          </GlassCard>
        )}

        {allPlaylists.map((playlist) => (
          <TouchableOpacity
            key={playlist.id}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => openPlaylist(playlist)}
            onLongPress={() => onPlayPlaylist(playlist)}
          >
            {playlist.id === 'liked' ? (
              <View style={[styles.image, styles.likedGradient]}>
                <Heart color={COLORS.text.primary} size={22} fill={COLORS.text.primary} />
              </View>
            ) : playlist.coverImageUrl || playlist.tracks[0]?.albumImageUrl ? (
              <Image
                source={{ uri: playlist.coverImageUrl || playlist.tracks[0]?.albumImageUrl }}
                style={styles.image}
              />
            ) : (
              <View style={[styles.image, styles.emptyCover]} />
            )}
            <View style={styles.info}>
              <Text style={styles.title}>{playlist.name}</Text>
              <Text style={styles.subtitle}>
                {playlist.id === 'liked'
                  ? `${playlist.tracks.length} songs`
                  : `Playlist • ${playlist.creator} • ${playlist.tracks.length}`}
              </Text>
            </View>
            {playlist.id !== 'liked' && (
              <TouchableOpacity style={styles.deleteButton} onPress={() => deletePlaylist(playlist.id)}>
                <Trash2 color={COLORS.text.muted} size={18} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.md,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 22, color: COLORS.text.primary },
  addButton: { padding: SIZES.sm },
  scrollContent: { paddingHorizontal: SIZES.md },
  importCard: { padding: SIZES.md, marginBottom: SIZES.md },
  importTitle: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text.primary, marginBottom: SIZES.sm },
  importRow: { flexDirection: 'row', alignItems: 'center' },
  importInput: {
    flex: 1,
    height: 40,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.primary,
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: SIZES.radius.sm,
    paddingHorizontal: SIZES.sm,
  },
  importButton: {
    marginLeft: SIZES.sm,
    height: 40,
    minWidth: 56,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.accent.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonDisabled: { opacity: 0.4 },
  importButtonText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.background },
  panelDivider: { height: 1, backgroundColor: COLORS.glassBorder, marginVertical: SIZES.md },
  importError: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.accent.red, marginTop: SIZES.sm },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.md, paddingVertical: SIZES.xs },
  image: { width: 64, height: 64, borderRadius: SIZES.radius.sm, backgroundColor: COLORS.surfaceLight },
  likedGradient: { backgroundColor: COLORS.accent.green, alignItems: 'center', justifyContent: 'center' },
  emptyCover: { backgroundColor: COLORS.surfaceLight },
  info: { flex: 1, marginLeft: SIZES.md, justifyContent: 'center' },
  title: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.text.primary, marginBottom: 4 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.text.secondary },
  deleteButton: { padding: SIZES.sm },
});
