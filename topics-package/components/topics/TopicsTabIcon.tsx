import React from 'react';
import Svg, { Circle } from 'react-native-svg';

interface TopicsTabIconProps {
    color: string;
    focused: boolean;
}

export function TopicsTabIcon({ color, focused }: TopicsTabIconProps) {
    const fill = focused ? 'rgba(255,255,255,0.12)' : 'none';

    return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Circle
                cx={8}
                cy={14}
                r={3.6}
                stroke={color}
                strokeWidth={1.7}
                fill={fill}
            />
            <Circle
                cx={16.2}
                cy={11.5}
                r={2.6}
                stroke={color}
                strokeWidth={1.7}
                fill={fill}
            />
            <Circle
                cx={14.5}
                cy={17.2}
                r={2}
                stroke={color}
                strokeWidth={1.7}
                fill={fill}
            />
        </Svg>
    );
}
