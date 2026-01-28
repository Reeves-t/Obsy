import React, { useState, useRef } from 'react';
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
// TODO: Uncomment when Turnstile is configured
// import { ReactNativeTurnstile } from 'react-native-turnstile';
// import Constants from 'expo-constants';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // TODO: Uncomment when Turnstile is configured
  // const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // const [turnstileVerified, setTurnstileVerified] = useState(false);
  // const [verifying, setVerifying] = useState(false);
  // const [turnstileError, setTurnstileError] = useState<string | null>(null);
  // const turnstileRef = useRef<any>(null);
  const router = useRouter();
  const { signUp } = useAuth();
  const { signIn } = useAuth(); // Needed for social login which is technically a sign-in

  // TODO: Uncomment when Turnstile is configured
  // async function verifyTurnstileToken(token: string) {
  //   setVerifying(true);
  //   setTurnstileError(null);
  //
  //   try {
  //     const { data, error } = await supabase.functions.invoke('verify-turnstile', {
  //       body: { token },
  //     });
  //
  //     if (error) {
  //       throw new Error(error.message || 'Verification failed');
  //     }
  //
  //     if (!data?.success) {
  //       throw new Error(data?.error || 'Bot verification failed');
  //     }
  //
  //     setTurnstileVerified(true);
  //     return true;
  //   } catch (err: any) {
  //     setTurnstileError(err.message);
  //     setTurnstileVerified(false);
  //     Alert.alert('Verification Failed', err.message);
  //     return false;
  //   } finally {
  //     setVerifying(false);
  //   }
  // }

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

  async function handleSignUp() {
    // TODO: Uncomment when Turnstile is configured
    // if (!turnstileVerified) {
    //   Alert.alert('Verification Required', 'Please complete the security verification');
    //   return;
    // }

    // Validation
    if (!fullName.trim()) {
      Alert.alert('Missing Information', 'Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Missing Information', 'Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await signUp(email, password, fullName.trim());

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
      // TODO: Uncomment when Turnstile is configured
      // Reset Turnstile on signup failure
      // setTurnstileVerified(false);
      // setTurnstileToken(null);
      // turnstileRef.current?.reset();
      setLoading(false);
    } else {
      Alert.alert(
        'Account Created!',
        'Please check your email to verify your account.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join Obsy to sync your captures across devices
          </Text>
        </View>

        {/* TODO: Uncomment when Turnstile is configured */}
        {/* Turnstile Bot Protection */}
        {/* <View style={styles.turnstileContainer}>
          <ReactNativeTurnstile
            ref={turnstileRef}
            siteKey={Constants.expoConfig?.extra?.turnstileSiteKey || process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || ''}
            onVerify={(token) => {
              setTurnstileToken(token);
              verifyTurnstileToken(token);
            }}
            onError={(error) => {
              setTurnstileError('Verification widget failed to load');
              Alert.alert('Verification Error', 'Please refresh and try again');
            }}
            theme="dark"
            size="normal"
          />

          {verifying && (
            <View style={styles.verifyingIndicator}>
              <ActivityIndicator size="small" color={Colors.obsy.silver} />
              <Text style={styles.verifyingText}>Verifying...</Text>
            </View>
          )}

          {turnstileVerified && (
            <View style={styles.verifiedIndicator}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}

          {turnstileError && (
            <Text style={styles.errorText}>{turnstileError}</Text>
          )}
        </View> */}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor="#666"
              autoCapitalize="words"
              autoCorrect={false}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

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
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor="#666"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#666"
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
            // TODO: Uncomment when Turnstile is configured
            // style={[styles.button, (loading || verifying || !turnstileVerified) && styles.buttonDisabled]}
            // disabled={loading || verifying || !turnstileVerified}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
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

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.replace('/auth/login')}
          >
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkBold}>Sign In</Text>
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
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    lineHeight: 22,
  },
  form: {
    flex: 1,
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  passwordInput: {
    flex: 1,
    color: '#fff',
    padding: 16,
    fontSize: 16,
  },
  eyeButton: {
    padding: 16,
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
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
  },
  linkBold: {
    color: Colors.obsy.silver,
    fontWeight: '600',
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
  turnstileContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  verifyingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  verifyingText: {
    color: '#888',
    fontSize: 14,
  },
  verifiedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  verifiedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 8,
  },
});