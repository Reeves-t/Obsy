import React, { useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Dimensions } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { ThemedText } from '@/components/ui/ThemedText';
import { useYearInPixelsStore, PixelData } from '@/lib/yearInPixelsStore';
import { useObsyTheme } from '@/contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CANVAS_SIZE = SCREEN_WIDTH - 40; // Must match ExpandedDayCanvas for viewBox scaling
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GAP = 4;
const GOLD = '#D4AF37';

interface MonthPixelGridProps {
    year: number;
    month: number; // 0-indexed
    gridWidth: number;
    onDayPress: (dateKey: string) => void;
}

export const MonthPixelGrid: React.FC<MonthPixelGridProps> = ({ year, month, gridWidth, onDayPress }) => {
    const { pixels } = useYearInPixelsStore();
    const { isLight, isDark } = useObsyTheme();

    const cellSize = Math.floor((gridWidth - 6 * GAP) / 7);

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const weeks = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDow = firstDay.getDay();

        const rows: (number | null)[][] = [];
        let currentWeek: (number | null)[] = [];

        for (let i = 0; i < startDow; i++) {
            currentWeek.push(null);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            currentWeek.push(day);
            if (currentWeek.length === 7) {
                rows.push(currentWeek);
                currentWeek = [];
            }
        }

        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) {
                currentWeek.push(null);
            }
            rows.push(currentWeek);
        }

        return rows;
    }, [year, month]);

    const emptyColor = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
    const headerColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
    const dayNumColor = isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';

    return (
        <View style={styles.container}>
            {/* Day-of-week headers */}
            <View style={[styles.row, { gap: GAP }]}>
                {DAY_HEADERS.map((h, i) => (
                    <View key={i} style={[styles.headerCell, { width: cellSize }]}>
                        <ThemedText style={[styles.headerText, { color: headerColor }]}>{h}</ThemedText>
                    </View>
                ))}
            </View>

            {/* Week rows */}
            {weeks.map((week, wi) => (
                <View key={wi} style={[styles.row, { gap: GAP }]}>
                    {week.map((day, di) => {
                        if (day === null) {
                            return <View key={di} style={{ width: cellSize, height: cellSize }} />;
                        }

                        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const pixel = pixels[dateKey];
                        const pixelColor = pixel?.color || null;
                        const hasStrokes = pixel?.strokes && pixel.strokes.length > 0;
                        const isToday = dateKey === todayKey;
                        const isFuture = new Date(year, month, day) > today;

                        return (
                            <TouchableOpacity
                                key={di}
                                disabled={isFuture}
                                activeOpacity={0.7}
                                onPress={() => onDayPress(dateKey)}
                                style={[
                                    styles.dayCell,
                                    {
                                        width: cellSize,
                                        height: cellSize,
                                        backgroundColor: pixelColor || emptyColor,
                                        opacity: isFuture ? 0.25 : 1,
                                        borderRadius: 6,
                                    },
                                    isToday && {
                                        borderWidth: 1.5,
                                        borderColor: isLight ? 'rgba(0,0,0,0.2)' : GOLD,
                                    },
                                ]}
                            >
                                {/* Render miniature strokes */}
                                {hasStrokes && (
                                    <Svg
                                        width={cellSize}
                                        height={cellSize}
                                        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
                                        style={StyleSheet.absoluteFill}
                                    >
                                        {pixel!.strokes.map((stroke, i) => (
                                            <Path
                                                key={i}
                                                d={stroke.path}
                                                stroke={stroke.color === 'transparent' ? (pixelColor || (isDark ? 'black' : 'white')) : stroke.color}
                                                strokeWidth={stroke.strokeWidth}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                fill="none"
                                            />
                                        ))}
                                    </Svg>
                                )}
                                <ThemedText style={[styles.dayNum, { color: (pixelColor || hasStrokes) ? 'rgba(255,255,255,0.7)' : dayNumColor }]}>
                                    {day}
                                </ThemedText>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        gap: GAP,
    },
    row: {
        flexDirection: 'row',
    },
    headerCell: {
        alignItems: 'center',
        paddingBottom: 4,
    },
    headerText: {
        fontSize: 11,
        fontWeight: '600',
    },
    dayCell: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    dayNum: {
        fontSize: 11,
    },
});
