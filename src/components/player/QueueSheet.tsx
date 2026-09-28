import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  LayoutAnimation,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';
import { Track } from '../../core/types';

// Smooth row shifts while dragging (Android needs this flag enabled once).
const anyUI = UIManager as any;
if (Platform.OS === 'android' && typeof anyUI.setLayoutAnimationEnabledExperimental === 'function') {
  anyUI.setLayoutAnimationEnabledExperimental(true);
}

/** Fixed row height so drag math stays exact (48 art + 8 pad top/bottom). */
const ROW_HEIGHT = 64;

const arrayMove = <T,>(list: T[], from: number, to: number): T[] => {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Animated equalizer bars for the now-playing row (Image 4 look). */
const EqBars: React.FC = () => {
  const bar1 = useRef(new Animated.Value(6)).current;
  const bar2 = useRef(new Animated.Value(12)).current;
  const bar3 = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.sequence([
        Animated.timing(bar1, { toValue: 14, duration: 400, useNativeDriver: false }),
        Animated.timing(bar1, { toValue: 6, duration: 400, useNativeDriver: false }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(bar2, { toValue: 6, duration: 300, useNativeDriver: false }),
        Animated.timing(bar2, { toValue: 16, duration: 300, useNativeDriver: false }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(bar3, { toValue: 12, duration: 500, useNativeDriver: false }),
        Animated.timing(bar3, { toValue: 4, duration: 500, useNativeDriver: false }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.eqBars}>
      <Animated.View style={[styles.eqBar, { height: bar1 }]} />
      <Animated.View style={[styles.eqBar, { height: bar2 }]} />
      <Animated.View style={[styles.eqBar, { height: bar3 }]} />
    </View>
  );
};

interface QueueSheetProps {
  visible: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  upcoming: Track[];
  onClose: () => void;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
  /** Called on drag release with the new order of upcoming track ids. */
  onReorder: (ids: string[]) => void;
}

export const QueueSheet: React.FC<QueueSheetProps> = ({
  visible,
  currentTrack,
  isPlaying,
  upcoming,
  onClose,
  onJump,
  onRemove,
  onReorder,
}) => {
  const [order, setOrder] = useState<Track[]>(upcoming);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);

  const orderRef = useRef<Track[]>(upcoming);
  const draggingRef = useRef(false);
  const carryRef = useRef(0);
  const panCache = useRef<Map<string, ReturnType<typeof PanResponder.create>>>(new Map());

  // Keep local order in sync with the real queue (except mid-drag).
  useEffect(() => {
    if (!draggingRef.current) {
      orderRef.current = upcoming;
      setOrder(upcoming);
    }
  }, [upcoming, visible]);

  /** One PanResponder per track id, cached — handlers read refs so no stale state. */
  const getPan = (id: string) => {
    const cached = panCache.current.get(id);
    if (cached) return cached;

    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = true;
        carryRef.current = 0;
        setDragId(id);
        setDragDy(0);
      },
      onPanResponderMove: (_evt, gesture) => {
        const effDy = gesture.dy + carryRef.current;
        const list = orderRef.current;
        const from = list.findIndex((t) => t.id === id);
        if (from < 0) return;
        const target = Math.min(list.length - 1, Math.max(0, from + Math.round(effDy / ROW_HEIGHT)));
        if (target !== from) {
          LayoutAnimation.easeInEaseOut();
          const next = arrayMove(list, from, target);
          orderRef.current = next;
          setOrder(next);
          carryRef.current -= (target - from) * ROW_HEIGHT;
          setDragDy(effDy - (target - from) * ROW_HEIGHT);
        } else {
          setDragDy(effDy);
        }
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        setDragId(null);
        setDragDy(0);
        carryRef.current = 0;
        onReorder(orderRef.current.map((t) => t.id));
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        setDragId(null);
        setDragDy(0);
        carryRef.current = 0;
      },
    });
    panCache.current.set(id, pan);
    return pan;
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Playing Next</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X color={COLORS.text.secondary} size={20} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: SIZES.lg }}
          scrollEnabled={dragId === null}
          showsVerticalScrollIndicator={false}
        >
          {/* Now playing row — pink + animated EQ, per Image 4 */}
          {currentTrack && (
            <View style={styles.currentRow}>
              <Image
                source={{ uri: currentTrack.albumImageUrl }}
                style={styles.artwork}
                resizeMode="cover"
              />
              <View style={styles.currentTextWrap}>
                <Text style={styles.currentTitle} numberOfLines={1}>{currentTrack.title}</Text>
                <Text style={styles.currentArtist} numberOfLines={1}>{currentTrack.artist.name}</Text>
              </View>
              {isPlaying && <EqBars />}
            </View>
          )}

          <View style={styles.divider} />

          {order.length === 0 ? (
            <Text style={styles.emptyText}>Nothing queued.</Text>
          ) : (
            order.map((track) => {
              const isDragged = dragId === track.id;
              return (
                <View
                  key={track.id}
                  style={[
                    styles.row,
                    isDragged && { transform: [{ translateY: dragDy }], zIndex: 20, elevation: 20 },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.rowMain}
                    activeOpacity={0.7}
                    onPress={() => onJump(track.id)}
                  >
                    <Image
                      source={{ uri: track.albumImageUrl }}
                      style={styles.artwork}
                      resizeMode="cover"
                    />
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.rowArtist} numberOfLines={1}>{track.artist.name}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => onRemove(track.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.removeBtn}>
                    <X color={COLORS.text.disabled} size={15} />
                  </TouchableOpacity>

                  {/* Invisible drag handle in the same spot the dots used to
                      occupy -- reordering still works via long-press+drag
                      here, just without the visible 6-dot graphic. */}
                  <View style={styles.gripTouch} {...getPan(track.id).panHandlers} />
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: COLORS.surfaceRaised,
    borderTopLeftRadius: SIZES.radius.lg,
    borderTopRightRadius: SIZES.radius.lg,
    padding: SIZES.lg,
  },
  grabber: {
    width: 36, height: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: SIZES.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  headerTitle: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.text.primary },
  closeBtn: { padding: SIZES.xs },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
  },
  currentTextWrap: { flex: 1, marginRight: SIZES.md },
  currentTitle: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.accent.green },
  currentArtist: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.accent.green, marginTop: 1 },
  eqBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  eqBar: { width: 3, backgroundColor: COLORS.accent.green, borderRadius: 1.5 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.hairline,
    marginVertical: SIZES.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: SIZES.sm },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text.primary },
  rowArtist: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.text.secondary, marginTop: 1 },
  artwork: {
    width: 48, height: 48,
    borderRadius: SIZES.radius.sm,
    backgroundColor: COLORS.surfaceLight,
    marginRight: SIZES.md,
  },
  removeBtn: { paddingHorizontal: SIZES.sm },
  gripTouch: { padding: SIZES.sm, paddingLeft: 2 },
  gripDots: {
    width: 9, height: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  gripDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.text.muted },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: SIZES.lg,
  },
});
