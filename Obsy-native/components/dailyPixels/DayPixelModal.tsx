import React from 'react';
import { ExpandedDayCanvas } from '@/components/yearInPixels/ExpandedDayCanvas';

interface DayPixelModalProps {
    visible: boolean;
    date: string; // YYYY-MM-DD
    onClose: () => void;
}

export const DayPixelModal: React.FC<DayPixelModalProps> = ({ visible, date, onClose }) => {
    return (
        <ExpandedDayCanvas
            visible={visible}
            date={date}
            onClose={onClose}
        />
    );
};
