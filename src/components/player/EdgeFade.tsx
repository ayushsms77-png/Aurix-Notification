import React, { useMemo } from 'react';
import { Animated } from 'react-native';
import { edgeFadeStops } from './lyricsMath';

/**
 * Fades one lyric line to transparent as it nears the top or bottom edge of
 * the lyrics area, so lines dissolve in and out instead of being cut off.
 *
 * `translate` is the animated offset the line moves with (the gliding
 * content's translateY, or the negated scroll offset for plain lyrics); the
 * opacity is a native-driver interpolation of it, so there is no per-frame JS
 * and -- unlike an alpha mask -- no extra native view sitting over the page.
 */
type Props = {
  translate: Animated.Value | Animated.AnimatedMultiplication<number>;
  /** Vertical centre of this line inside the moving content (dp). */
  center: number | undefined;
  areaHeight: number;
  fadeTop: number;
  fadeBottom: number;
  children: React.ReactNode;
};

export const EdgeFade: React.FC<Props> = ({ translate, center, areaHeight, fadeTop, fadeBottom, children }) => {
  const opacity = useMemo(() => {
    if (center == null || !areaHeight) return 0; // not measured yet: stay hidden
    const { input, output } = edgeFadeStops(center, areaHeight, fadeTop, fadeBottom);
    return translate.interpolate({ inputRange: input, outputRange: output, extrapolate: 'clamp' });
  }, [translate, center, areaHeight, fadeTop, fadeBottom]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};
