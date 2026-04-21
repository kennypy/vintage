import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  enrollBiometric,
  getBiometricCapability,
  isBiometricEnrolled,
  unlockWithBiometric,
} from '../../src/services/biometric';

// expo-web-browser requires a native module that may not be available in all runtimes
// (e.g. Expo Go). Load it lazily so the screen still renders when it's missing.
let _webBrowserReady = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebBrowser = require('expo-web-browser') as typeof import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  _webBrowserReady = true;
} catch (_e) {
  // Native module not available — social login will be disabled
}

// expo-auth-session/providers/google also depends on expo-web-browser internally
type GoogleAuthRequest = {
  useAuthRequest: (
    config: Record<string, unknown>
  ) => [unknown, { type: string; authentication?: { idToken?: string } } | null, () => Promise<void>];
};
let _Google: GoogleAuthRequest | null = null;
if (_webBrowserReady) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _Google = require('expo-auth-session/providers/google') as GoogleAuthRequest;
  } catch (_e) {
    // Not available
  }
}

type AppleAuthModule = typeof import('expo-apple-authentication');
let _Apple: AppleAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _Apple = require('expo-apple-authentication') as AppleAuthModule;
} catch (_e) {
  // Not available
}

// Stub hook used when Google auth modules are unavailable so hook call count is stable
function useGoogleAuthStub(): [null, null, () => Promise<void>] {
  return [null, null, async () => {}];
}

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { signIn, signInDemo, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  // Biometric unlock — only surfaced when the device supports it AND
  // the user opted in on a previous successful login.
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const useGoogleAuth = _Google?.useAuthRequest ?? useGoogleAuthStub;
  const [_request, googleResponse, promptGoogleAsync] = useGoogleAuth({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    scopes: ['openid', 'profile', 'email'],
  });

  // Surface the biometric button only when the device has hardware,
  // the user enrolled a face/finger, AND they opted in previously.
  useEffect(() => {
    (async () => {
      const cap = await getBiometricCapability();
      const enrolled = await isBiometricEnrolled();
      setBiometricReady(cap.available && cap.enrolled && enrolled);
    })();
  }, []);

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    try {
      const creds = await unlockWithBiometric();
      if (!creds) return;
      const challenge = await signIn(creds.email, creds.password);
      if (challenge) {
        router.replace({
          pathname: '/(auth)/2fa-challenge',
          params: {
            tempToken: challenge.tempToken,
            method: challenge.method,
            phoneHint: challenge.phoneHint ?? '',
          },
        });
        return;
      }
      router.replace('/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no desbloqueio biométrico.';
      Alert.alert('Erro', message);
    } finally {
      setBiometricLoading(false);
    }
  };

  useEffect(() => {
    if (googleResponse?.type === 'success' && googleResponse.authentication?.idToken) {
      const idToken = googleResponse.authentication.idToken;
      setSocialLoading(true);
      signInWithGoogle(idToken)
        .then(() => router.replace('/(tabs)'))
        .catch(() => Alert.alert('Erro ao entrar', 'Não foi possível entrar com Google. Tente novamente.'))
        .finally(() => setSocialLoading(false));
    }
  }, [googleResponse]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Campos obrigatórios', 'Preencha email e senha.');
      return;
    }

    setLoading(true);
    try {
      const challenge = await signIn(email, password);
      if (challenge) {
        // 2FA required — route to the challenge screen with the tempToken.
        router.replace({
          pathname: '/(auth)/2fa-challenge',
          params: {
            tempToken: challenge.tempToken,
            method: challenge.method,
            phoneHint: challenge.phoneHint ?? '',
          },
        });
        return;
      }

      // Offer biometric enrollment on first successful password login.
      // Silent no-op if the device doesn't support biometrics or the
      // user already opted in — never nag.
      const cap = await getBiometricCapability();
      const alreadyEnrolled = await isBiometricEnrolled();
      if (cap.available && cap.enrolled && !alreadyEnrolled) {
        Alert.alert(
          'Ativar desbloqueio por biometria?',
          'Entre mais rápido na próxima vez usando Face ID ou Touch ID.',
          [
            { text: 'Agora não', style: 'cancel', onPress: () => router.replace('/(tabs)') },
            {
              text: 'Ativar',
              onPress: async () => {
                await enrollBiometric(email, password);
                router.replace('/(tabs)');
              },
            },
          ],
        );
        return;
      }

      router.replace('/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email ou senha incorretos. Tente novamente.';
      Alert.alert('Erro ao entrar', message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!_Apple) return;
    setSocialLoading(true);
    try {
      const credential = await _Apple.signInAsync({
        requestedScopes: [
          _Apple.AppleAuthenticationScope.FULL_NAME,
          _Apple.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean).join(' ') || undefined;
        await signInWithApple(credential.identityToken, fullName);
        router.replace('/(tabs)');
      }
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== 'ERR_CANCELED') {
        Alert.alert('Erro ao entrar', 'Não foi possível entrar com Apple. Tente novamente.');
      }
    } finally {
      setSocialLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={[styles.logo, { color: colors.primary[600] }]}>Vintage.br</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Entre na sua conta</Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            placeholder="Email"
            placeholderTextColor={theme.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            placeholder="Senha"
            placeholderTextColor={theme.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={[styles.linkText, { color: colors.primary[600] }]}>Esqueceu a senha?</Text>
          </TouchableOpacity>

          {biometricReady && (
            <TouchableOpacity
              style={[styles.biometricButton, { borderColor: colors.primary[600] }]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading}
            >
              <Ionicons name="finger-print" size={20} color={colors.primary[600]} />
              <Text style={[styles.biometricButtonText, { color: colors.primary[600] }]}>
                {biometricLoading ? 'Verificando…' : 'Entrar com biometria'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textTertiary }]}>ou</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <TouchableOpacity
          style={[styles.socialButton, { borderColor: theme.border, backgroundColor: theme.card }]}
          onPress={() => {
            if (!_webBrowserReady) {
              Alert.alert('Indisponível', 'Login com Google requer uma versão de desenvolvimento com módulos nativos. Use email/senha por enquanto.');
              return;
            }
            promptGoogleAsync();
          }}
          disabled={loading || socialLoading}
        >
          <Text style={[styles.socialButtonText, { color: theme.text }]}>
            {socialLoading ? 'Entrando...' : 'Continuar com Google'}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && _Apple && (
          <TouchableOpacity
            style={[styles.socialButton, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={handleAppleSignIn}
            disabled={loading || socialLoading}
          >
            <Text style={[styles.socialButtonText, { color: theme.text }]}>Continuar com Apple</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.demoButton}
          onPress={async () => {
            await signInDemo();
            router.replace('/(tabs)');
          }}
        >
          <Text style={[styles.demoButtonText, { color: theme.textTertiary }]}>Testar em modo demo (sem conta)</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>Não tem conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={[styles.footerLink, { color: colors.primary[600] }]}>Cadastre-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  input: {
    height: 50, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16,
  },
  button: {
    height: 50, backgroundColor: colors.primary[600], borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 14 },
  biometricButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderWidth: 1, borderRadius: 12, marginTop: 4,
  },
  biometricButtonText: { fontSize: 15, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 14 },
  socialButton: {
    height: 50, borderWidth: 1, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  socialButtonText: { fontSize: 15, fontWeight: '500' },
  demoButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  demoButtonText: { fontSize: 13, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
});
