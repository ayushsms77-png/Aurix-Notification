import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { fadeRamp } from './lyricsMath';

/**
 * Fades whatever is inside to fully transparent at the top and bottom edges.
 *
 * A real alpha mask, not an overlay: the lyrics themselves dissolve, whatever
 * the album-art background behind them looks like, so lines glide in and out
 * with no visible edge. The mask is a stack of thin black strips whose alpha
 * follows a smoothstep curve (plain Views, so the native mask bitmap is drawn
 * reliably and there is no gradient library involved).
 */
const STRIPS = 28;
const RAMP = fadeRamp(STRIPS);

type Props = {
  children: React.ReactNode;
  /** Height of the top fade, in dp. */
  top?: number;
  /** Height of the bottom fade, in dp. */
  bottom?: number;
};

export const FadeMask: React.FC<Props> = ({ children, top = 64, bottom = 96 }) => {
  const mask = useMemo(() => {
    const strip = (h: number, alpha: number, key: string) => (
      <View key={key} style={{ height: h, backgroundColor: `rgba(0,0,0,${alpha.toFixed(3)})` }} />
    );
    return (
      <View style={StyleSheet.absoluteFill}>
        {RAMP.map((a, i) => strip(top / STRIPS, a, 't' + i))}
        <View style={styles.solid} />
        {[...RAMP].reverse().map((a, i) => strip(bottom / STRIPS, a, 'b' + i))}
      </View>
    );
  }, [top, bottom]);

  return (
    <MaskedView style={styles.fill} maskElement={mask}>
      {children}
    </MaskedView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  solid: { flex: 1, backgroundColor: '#000' },
});
