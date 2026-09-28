import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

interface FlowerMarkProps {
  size?: number;
}

/**
 * Builder mark: a minimal `</>` code glyph with a horizontal grey→accent
 * gradient (editorial / Swiss feel). Pure SVG, scales cleanly via `size`.
 * Geometry lives inside the 64-unit box with round caps so nothing clips.
 */
export const FlowerMark: React.FC<FlowerMarkProps> = ({ size = 52 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Defs>
      <LinearGradient
        id="fmGrad"
        x1="0"
        y1="32"
        x2="64"
        y2="32"
        gradientUnits="userSpaceOnUse"
      >
        <Stop offset="0" stopColor="#8E8E93" />
        <Stop offset="0.55" stopColor="#C2576B" />
        <Stop offset="1" stopColor="#FA2D55" />
      </LinearGradient>
    </Defs>
    {/* < */}
    <Path
      d="M20 18 L8 32 L20 46"
      stroke="url(#fmGrad)"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* > */}
    <Path
      d="M44 18 L56 32 L44 46"
      stroke="url(#fmGrad)"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* / */}
    <Path
      d="M37 12 L27 52"
      stroke="url(#fmGrad)"
      strokeWidth={6.5}
      strokeLinecap="round"
    />
  </Svg>
);
