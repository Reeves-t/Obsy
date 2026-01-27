import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Image } from 'expo-image';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { signIn } = useAuth();

    async function handleSignIn() {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing Information', 'Please enter both email and password.');
            return;
        }

        setLoading(true);
        const { error } = await signIn(email, password);

        if (error) {
            Alert.alert('Login Failed', error.message);
            setLoading(false);
        }
        // Success: AuthContext will redirect to (tabs)
    }

    function handleContinueAsGuest() {
        // Simply navigate to main app - no auth required
        router.replace('/(tabs)');
    }

    async function handleGoogleSignIn() {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: 'obsy://auth/callback',
                },
            });
            if (error) Alert.alert('Google Sign In Error', error.message);
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
        }
    }

    function handleAppleSignIn() {
        Alert.alert('Coming Soon', 'Apple Sign In is not yet configured.');
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            {/* Ambient corner glow orbs */}
            <AmbientBackground />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.content}>
                    {/* Logo / Branding */}
                    {/* Logo / Branding */}
                    <View style={styles.logoContainer}>
                        <Text style={{
                            color: '#fff',
                            fontSize: 48,
                            fontWeight: 'bold', // Fallback if font family not loaded, or use specific font
                            fontFamily: 'Inter_700Bold',
                            letterSpacing: -1
                        }}>OBSY</Text>
                    </View>

                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Sign in to sync your captures</Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="you@example.com"
                            placeholderTextColor="#666"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor="#666"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSignIn}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.buttonText}>Sign In</Text>
                        )}
                    </TouchableOpacity>

                    {/* Continue as Guest */}
                    <TouchableOpacity
                        style={styles.guestButton}
                        onPress={handleContinueAsGuest}
                    >
                        <Text style={styles.guestButtonText}>Continue as Guest</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>Or continue with</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Social Buttons */}
                    <View style={styles.socialContainer}>
                        <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn}>
                            <Ionicons name="logo-google" size={24} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.socialButton} onPress={handleAppleSignIn}>
                            <Ionicons name="logo-apple" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Sign Up Link */}
                    <TouchableOpacity
                        style={styles.signUpButton}
                        onPress={() => router.push('/auth/signup')}
                    >
                        <Text style={styles.signUpText}>
                            Don't have an account? <Text style={styles.signUpBold}>Sign Up</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // No backgroundColor - AmbientBackground provides the black base
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    logoText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '600',
        letterSpacing: 2,
    },
    title: {
        color: '#fff',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        color: '#888',
        fontSize: 16,
        marginBottom: 32,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        backgroundColor: '#1A1A1A',
        color: '#fff',
        padding: 16,
        borderRadius: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    button: {
        backgroundColor: Colors.obsy.silver,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    guestButton: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    guestButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#333',
    },
    dividerText: {
        color: '#666',
        paddingHorizontal: 16,
        fontSize: 14,
    },
    signUpButton: {
        alignItems: 'center',
    },
    signUpText: {
        color: '#888',
        fontSize: 14,
    },
    signUpBold: {
        color: Colors.obsy.silver,
        fontWeight: '600',
    },
    socialContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 24,
    },
    socialButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
});
