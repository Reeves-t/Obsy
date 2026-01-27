import React, { useState, ReactNode } from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSubscription, FeatureName } from '../hooks/useSubscription';
import { VanguardPaywall } from './paywall/VanguardPaywall';
import { useRouter } from 'expo-router';

interface PremiumGateProps {
    children: ReactNode;
    featureName: FeatureName;
    guestAction?: 'signup' | 'paywall'; // Default to paywall for free users, signup for guests
    triggerType?: 'press' | 'mount';
    style?: ViewStyle;
    onAction?: () => void; // Callback to execute if access is allowed
}

export function PremiumGate({
    children,
    featureName,
    guestAction = 'signup',
    triggerType = 'press',
    style,
    onAction
}: PremiumGateProps) {
    const { checkLimit, tier } = useSubscription();
    const [showPaywall, setShowPaywall] = useState(false);
    const router = useRouter();

    const handlePress = async () => {
        const allowed = checkLimit(featureName);

        if (allowed) {
            if (onAction) {
                onAction();
            }
            return;
        }

        // If we are here, it's blocked.
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        if (tier === 'guest' && guestAction === 'signup') {
            // Trigger Auth Modal
            // We'll assume a standard route for now.
            // If the user hasn't implemented the auth modal route yet, this might fail, 
            // but the requirement says "Trigger Sign Up Modal".
            router.push('/auth/signup');
        } else {
            setShowPaywall(true);
        }
    };

    return (
        <>
            <TouchableOpacity onPress={handlePress} style={style} activeOpacity={0.8}>
                {children}
            </TouchableOpacity>

            <VanguardPaywall
                visible={showPaywall}
                onClose={() => setShowPaywall(false)}
                featureName={featureName}
            />
        </>
    );
}
