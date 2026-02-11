import React, { useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { format } from 'date-fns';

interface MonthPixelGridProps {
    year: number;
    month: number; // 0-indexed
    gridWidth: number;
    onDayPress: (dateKey: string) => void;
}

const GAP = 4;

export const MonthPixelGrid: React.FC<MonthPixelGridProps> = ({ year, month, gridWidth, onDayPress }) => {
    const { isDark, isLight } = useObsyTheme();
    const { pixels } = useYearInPixelsStore();

    const cellSize = Math.floor((gridWidth - GAP * 6) / 7);
    const mutedText = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
    const emptyColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const todayBorder = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';

    const todayKey = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

    const weeks = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay(); // 0 = Sunday
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const result: (number | null)[][] = [];
        let week: (number | null)[] = [];

        for (let i = 0; i < startWeekday; i++) {
            week.push(null);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            week.push(day);
            if (week.length === 7) {
                result.push(week);
                week = [];
            }
        }

        if (week.length > 0) {
            while (week.length < 7) {
                week.push(null);
            }
            result.push(week);
        }

        return result;
    }, [year, month]);

    const getDateKey = (day: number) => {
        const m = String(month + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return `${year}-${m}-${d}`;
    };

    const getDayColor = (day: number): string | null => {
        const dateKey = getDateKey(day);
        return pixels[dateKey]?.color || null;
    };

    const hasCells = (day: number): boolean => {
        const dateKey = getDateKey(day);
        const gridCells = pixels[dateKey]?.gridCells;
        return gridCells ? Object.keys(gridCells).length > 0 : false;
    };

    const isFuture = (day: number): boolean => {
        const date = new Date(year, month, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date > today;
    };

    return (
        <View style={styles.container}>
            {/* Weekday headers */}
            <View style={[styles.weekRow, { gap: GAP }]}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
                    <View key={i} style={[styles.headerCell, { width: cellSize }]}>
                        <ThemedText style={[styles.weekdayLabel, { color: mutedText }]}>{label}</ThemedText>
                    </View>
                ))}
            </View>

            {/* Day cells */}
            {weeks.map((week, wIndex) => (
                <View key={wIndex} style={[styles.weekRow, { gap: GAP }]}>
                    {week.map((day, dIndex) => {
                        if (!day) {
                            return <View key={dIndex} style={[styles.emptyCell, { width: cellSize, height: cellSize }]} />;
                        }

                        const dateKey = getDateKey(day);
                        const color = getDayColor(day);
                        const isToday = dateKey === todayKey;
                        const future = isFuture(day);
                        const filled = !!color || hasCells(day);

                        return (
                            <TouchableOpacity
                                key={dIndex}
                                activeOpacity={0.7}
                                disabled={future}
                                onPress={() => onDayPress(dateKey)}
                            >
                                <View style={[
                                    styles.dayCell,
                                    {
                                        width: cellSize,
                                        height: cellSize,
                                        backgroundColor: color || emptyColor,
                                        opacity: future ? 0.25 : 1,
                                    },
                                    isToday && { borderWidth: 1.5, borderColor: todayBorder },
                                ]}>
                                    <ThemedText style={[
                                        styles.dayNumber,
                                        { color: filled ? 'rgba(255,255,255,0.7)' : mutedText },
                                    ]}>
                                        {day}
                                    </ThemedText>
                                </View>
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
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    headerCell: {
        alignItems: 'center',
        paddingBottom: 4,
    },
    weekdayLabel: {
        fontSize: 10,
        fontWeight: '600',
    },
    emptyCell: {
        borderRadius: 6,
    },
    dayCell: {
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayNumber: {
        fontSize: 11,
        fontWeight: '500',
    },
});
