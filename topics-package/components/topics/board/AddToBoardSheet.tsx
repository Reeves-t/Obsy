import React from 'react';
import { Modal, StyleSheet, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    StickyNote,
    ImageIcon,
    LinkIcon,
    FileText,
    Sparkles,
} from 'lucide-react-native';

export type AddBoardAction = 'note' | 'image' | 'link' | 'entry' | 'insight';

interface AddToBoardSheetProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (action: AddBoardAction) => void;
}

const OPTIONS: {
    action: AddBoardAction;
    label: string;
    sub: string;
    Icon: React.ComponentType<{ size?: number; color?: string }>;
}[] = [
    { action: 'note', label: 'Note', sub: 'A free text card', Icon: StickyNote },
    { action: 'image', label: 'Image', sub: 'From your library', Icon: ImageIcon },
    { action: 'link', label: 'Link', sub: 'Paste a URL', Icon: LinkIcon },
    { action: 'entry', label: 'Topic Entry', sub: 'Pull in a capture', Icon: FileText },
    { action: 'insight', label: 'Saved Insight', sub: 'Pull in a note or insight', Icon: Sparkles },
];

/**
 * Bottom sheet to add a block to the board. Matches the Obsy dark aesthetic.
 */
export function AddToBoardSheet({ visible, onClose, onSelect }: AddToBoardSheetProps) {
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.grabber} />
                <Text style={styles.title}>Add to Board</Text>
                {OPTIONS.map(({ action, label, sub, Icon }) => (
                    <Pressable
                        key={action}
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                        onPress={() => onSelect(action)}
                    >
                        <View style={styles.iconWrap}>
                            <Icon size={18} color="rgba(255,255,255,0.85)" />
                        </View>
                        <View style={styles.rowText}>
                            <Text style={styles.rowLabel}>{label}</Text>
                            <Text style={styles.rowSub}>{sub}</Text>
                        </View>
                    </Pressable>
                ))}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#101016',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 18,
        paddingTop: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginBottom: 14,
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
        marginLeft: 2,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
    },
    rowPressed: {
        opacity: 0.6,
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: {
        flex: 1,
    },
    rowLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    rowSub: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.45)',
        marginTop: 1,
    },
});
