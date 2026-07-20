import { Stack } from 'expo-router';

export default function UnpackLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="loading" options={{ gestureEnabled: false }} />
            <Stack.Screen name="question" />
            <Stack.Screen name="review" options={{ gestureEnabled: false }} />
        </Stack>
    );
}
