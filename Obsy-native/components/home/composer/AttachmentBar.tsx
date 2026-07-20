import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useObsyTheme } from '@/contexts/ThemeContext';

export type AttachmentKind = 'none' | 'photo' | 'voice' | 'link';

interface AttachmentBarProps {
    activeKind: AttachmentKind;
    disabled?: boolean;
    onPickPhoto: () => void;
    onStartVoice: () => void;
    onOpenLink: () => void;
}

const COBALT = '#41caec';

/**
 * Photo / mic / link attach icons in the composer footer. Entries have a
 * single source_type, so while one attachment is active the other two are
 * disabled.
 */
export function AttachmentBar({
    activeKind,
    disabled = false,
    onPickPhoto,
    onStartVoice,
    onOpenLink,
}: AttachmentBarProps) {
    const { colors, isLight } = useObsyTheme();
    const idleColor = isLight ? colors.cardTextSecondary : 'rgba(255,255,255,0.5)';
    const idleBorder = isLight ? colors.cardBorder : 'rgba(255,255,255,0.1)';

    const renderButton = (
        kind: Exclude<AttachmentKind, 'none'>,
        icon: keyof typeof Ionicons.glyphMap,
        onPress: () => void
    ) => {
        const isActive = activeKind === kind;
        const isBlocked = disabled || (activeKind !== 'none' && !isActive);

        return (
            <TouchableOpacity
                onPress={onPress}
                disabled={isBlocked}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                style={[
                    styles.iconButton,
                    { borderColor: isActive ? `${COBALT}66` : idleBorder },
                    isActive && styles.iconButtonActive,
                    isBlocked && styles.iconButtonBlocked,
                ]}
            >
                <Ionicons name={icon} size={17} color={isActive ? COBALT : idleColor} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.row}>
            {renderButton('photo', 'add', onPickPhoto)}
            {renderButton('voice', 'mic-outline', onStartVoice)}
            {renderButton('link', 'link-outline', onOpenLink)}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: 11,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconButtonActive: {
        backgroundColor: `${COBALT}1A`,
    },
    iconButtonBlocked: {
        opacity: 0.35,
    },
});
