import React, { useMemo } from 'react';
import { StyleSheet, View, PixelRatio, Dimensions } from 'react-native';
import { ThemedText } from '@/components/ui/ThemedText';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';
import { format } from 'date-fns';
import { useCaptureStore } from '@/lib/captureStore';
import { Image } from 'expo-image';
import { getLocalDayKey } from '@/lib/utils';
import { Svg, Path } from 'react-native-svg';

const ENABLE_FUTURE_EDITING = false; // Dev flag for testing

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 40;
const DAY_LABEL_WIDTH = 24;

interface PixelGridProps {
    availableHeight: number;
}

export const PixelGrid: React.FC<PixelGridProps> = ({ availableHeight }) => {
    const { isDark, isLight } = useObsyTheme();
    const { year, pixels, photoMode } = useYearInPixelsStore();
    const { captures } = useCaptureStore();

    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    // Calculate row height dynamically - month header takes ~20px, rest divided by 31
    const MONTH_HEADER_HEIGHT = 20;
    const rowHeight = useMemo(() => {
        const gridBodyHeight = availableHeight - MONTH_HEADER_HEIGHT;
        return PixelRatio.roundToNearestPixel(gridBodyHeight / 31);
    }, [availableHeight]);

    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const isFutureDate = (day: number, monthIndex: number) => {
        const date = new Date(year, monthIndex, day);
        return date > today;
    };

    const getCellPixel = (day: number, monthIndex: number) => {
        const date = new Date(year, monthIndex, day);
        if (date.getMonth() !== monthIndex) return null;

        const dateKey = format(date, 'yyyy-MM-dd');
        return pixels[dateKey] || null;
    };

    const getDayPhoto = (day: number, monthIndex: number) => {
        const date = new Date(year, monthIndex, day);
        if (date.getMonth() !== monthIndex) return null;

        const dateKey = format(date, 'yyyy-MM-dd');
        const pixel = pixels[dateKey];

        if (pixel?.photoUri) return pixel.photoUri;

        const dayCaptures = captures.filter(c => getLocalDayKey(new Date(c.created_at)) === dateKey);
        return dayCaptures[0]?.image_url || null;
    };

    const isInvalidDate = (day: number, monthIndex: number) => {
        const date = new Date(year, monthIndex, day);
        return date.getMonth() !== monthIndex;
    };

    // Cell size based on row height (square cells)
    const cellSize = PixelRatio.roundToNearestPixel(rowHeight - 2); // Slight padding

    return (
        <View style={styles.container}>
            {/* Month Header */}
            <View style={[styles.monthHeader, { height: MONTH_HEADER_HEIGHT }]}>
                <View style={[styles.dayLabelSpacer, { width: DAY_LABEL_WIDTH }]} />
                <View style={styles.monthLabelsRow}>
                    {months.map((m, i) => (
                        <View key={i} style={styles.monthLabelContainer}>
                            <ThemedText style={[styles.monthLabel, { color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }]}>{m}</ThemedText>
                        </View>
                    ))}
                </View>
            </View>

            {/* Grid Content - flex: 1 to fill remaining space */}
            <View style={styles.gridBody}>
                {days.map((day) => (
                    <View key={day} style={[styles.row, { height: rowHeight }]}>
                        <View style={[styles.dayLabelContainer, { width: DAY_LABEL_WIDTH }]}>
                            <ThemedText style={[styles.dayLabel, { color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }]}>{day}</ThemedText>
                        </View>
                        <View style={styles.cellsRow}>
                            {months.map((_, mIndex) => {
                                const invalid = isInvalidDate(day, mIndex);
                                const isFuture = !invalid && isFutureDate(day, mIndex);
                                return (
                                    <PixelCell
                                        key={`${day}-${mIndex}`}
                                        day={day}
                                        mIndex={mIndex}
                                        invalid={invalid}
                                        isFuture={isFuture && !ENABLE_FUTURE_EDITING}
                                        pixel={getCellPixel(day, mIndex)}
                                        cellSize={cellSize}
                                        photoMode={photoMode}
                                        isDark={isDark}
                                        getDayPhoto={getDayPhoto}
                                    />
                                );
                            })}
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
};

interface PixelCellProps {
    day: number;
    mIndex: number;
    invalid: boolean;
    isFuture: boolean;
    pixel: any;
    cellSize: number;
    photoMode: boolean;
    isDark: boolean;
    getDayPhoto: (day: number, mIndex: number) => string | null;
}

const PixelCell = React.memo(({
    day,
    mIndex,
    invalid,
    isFuture,
    pixel,
    cellSize,
    photoMode,
    isDark,
    getDayPhoto
}: PixelCellProps) => {
    return (
        <View style={styles.cellContainer}>
            <View
                style={[
                    styles.cell,
                    {
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: photoMode
                            ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
                            : (pixel?.color || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)')),
                        opacity: invalid ? 0 : isFuture ? 0.3 : 1
                    }
                ]}
            >
                {!photoMode && !invalid && !isFuture && pixel?.strokes && pixel.strokes.length > 0 && (
                    <Svg width={cellSize} height={cellSize} viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}>
                        {pixel.strokes.map((stroke: any, i: number) => (
                            <Path
                                key={i}
                                d={stroke.path}
                                stroke={stroke.color === 'transparent' ? (pixel.color || (isDark ? 'black' : 'white')) : stroke.color}
                                strokeWidth={stroke.strokeWidth}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        ))}
                    </Svg>
                )}
                {photoMode && !invalid && (
                    <View style={styles.photoContainer}>
                        {getDayPhoto(day, mIndex) ? (
                            <Image
                                source={{ uri: getDayPhoto(day, mIndex) || undefined }}
                                style={styles.microPhoto}
                                contentFit="cover"
                                transition={300}
                            />
                        ) : (
                            <View style={[styles.photoPlaceholder, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }]} />
                        )}
                    </View>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    monthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dayLabelSpacer: {
        // Width set inline
    },
    monthLabelsRow: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    monthLabelContainer: {
        flex: 1,
        alignItems: 'center',
    },
    monthLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    gridBody: {
        flex: 1,
        justifyContent: 'space-between',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dayLabelContainer: {
        alignItems: 'flex-end',
        paddingRight: 4,
        justifyContent: 'center',
    },
    dayLabel: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
    },
    cellsRow: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    cellContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cell: {
        borderRadius: 3,
        overflow: 'hidden',
    },
    photoContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    microPhoto: {
        width: '100%',
        height: '100%',
        opacity: 0.6,
    },
    photoPlaceholder: {
        flex: 1,
    },
});
