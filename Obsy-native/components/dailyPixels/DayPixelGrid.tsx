import React, { useMemo, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { useObsyTheme } from '@/contexts/ThemeContext';
import { useYearInPixelsStore } from '@/lib/yearInPixelsStore';

const GRID_SIZE = 8;

interface DayPixelGridProps {
    date: string; // YYYY-MM-DD
    gridWidth: number;
}

export const DayPixelGrid: React.FC<DayPixelGridProps> = ({ date, gridWidth }) => {
    const { isDark } = useObsyTheme();
    const { pixels, legend, activeColorId, setGridCell } = useYearInPixelsStore();

    const gridCells = pixels[date]?.gridCells || {};
    const cellSize = Math.floor(gridWidth / GRID_SIZE);
    const totalSize = cellSize * GRID_SIZE;

    const activeColor = useMemo(() => {
        const item = legend.find(l => l.id === activeColorId);
        return item?.color || null;
    }, [activeColorId, legend]);

    const handleCellPress = useCallback((row: number, col: number) => {
        if (!activeColor) return;
        const cellKey = `${row},${col}`;
        setGridCell(date, cellKey, activeColor);
    }, [date, activeColor, setGridCell]);

    const handleCellLongPress = useCallback((row: number, col: number) => {
        const cellKey = `${row},${col}`;
        setGridCell(date, cellKey, null);
    }, [date, setGridCell]);

    const emptyColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

    const rows = useMemo(() => Array.from({ length: GRID_SIZE }, (_, i) => i), []);
    const cols = useMemo(() => Array.from({ length: GRID_SIZE }, (_, i) => i), []);

    return (
        <View style={[styles.container, { width: totalSize, height: totalSize, borderColor }]}>
            {rows.map((row) => (
                <View key={row} style={styles.row}>
                    {cols.map((col) => {
                        const cellKey = `${row},${col}`;
                        const color = gridCells[cellKey];
                        return (
                            <TouchableOpacity
                                key={cellKey}
                                activeOpacity={0.7}
                                onPress={() => handleCellPress(row, col)}
                                onLongPress={() => handleCellLongPress(row, col)}
                                delayLongPress={400}
                            >
                                <View
                                    style={[
                                        styles.cell,
                                        {
                                            width: cellSize,
                                            height: cellSize,
                                            backgroundColor: color || emptyColor,
                                            borderColor,
                                        },
                                    ]}
                                />
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
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
    },
    row: {
        flexDirection: 'row',
    },
    cell: {
        borderWidth: 0.5,
        borderRadius: 2,
    },
});
