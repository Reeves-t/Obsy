import React from 'react';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

interface ObsyLogoMarkProps {
  size?: number;
}

// Orb data lifted from obsy.cobalt.logo.svg (same source as QuickMoodButton /
// ObsyAnimatedSplash). Positions/sizes are in the original 500-viewBox space.
const ORBS = [
  {
    cx: 290,
    cy: 290,
    r: 76.7,
    grad: { cx: '30%', cy: '30%', r: '70%' },
    stops: [
      { offset: '0%', color: '#41caec', opacity: '1' },
      { offset: '31.76%', color: '#118dac', opacity: '0.95' },
      { offset: '73.76%', color: '#1d4d72', opacity: '0.7' },
      { offset: '100%', color: '#1a2643', opacity: '0' },
    ],
  },
  {
    cx: 180,
    cy: 220,
    r: 31.86,
    grad: { cx: '68%', cy: '32%', r: '68%' },
    stops: [
      { offset: '0%', color: '#899fd2', opacity: '1' },
      { offset: '31.76%', color: '#4160aa', opacity: '0.95' },
      { offset: '73.76%', color: '#1a5071', opacity: '0.7' },
      { offset: '100%', color: '#04222a', opacity: '0' },
    ],
  },
  {
    cx: 200,
    cy: 340,
    r: 25.96,
    grad: { cx: '38%', cy: '60%', r: '65%' },
    stops: [
      { offset: '0%', color: '#61a9d9', opacity: '1' },
      { offset: '31.76%', color: '#2b7db3', opacity: '0.95' },
      { offset: '73.76%', color: '#174361', opacity: '0.7' },
      { offset: '100%', color: '#091b27', opacity: '0' },
    ],
  },
];

/** Static (non-animated) 3-orb Obsy mark. */
export function ObsyLogoMark({ size = 24 }: ObsyLogoMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 500 500">
      <Defs>
        {ORBS.map((orb, i) => (
          <RadialGradient
            key={i}
            id={`obsyMarkOrb${i}`}
            cx={orb.grad.cx}
            cy={orb.grad.cy}
            r={orb.grad.r}
          >
            {orb.stops.map((s, j) => (
              <Stop key={j} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
            ))}
          </RadialGradient>
        ))}
      </Defs>
      {ORBS.map((orb, i) => (
        <Circle key={i} cx={orb.cx} cy={orb.cy} r={orb.r} fill={`url(#obsyMarkOrb${i})`} />
      ))}
    </Svg>
  );
}
