import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';

/**
 * Hosts the Caf document + liveness flow inside a WebView. We
 * receive the redirectUrl from /users/me/verify-identity-document
 * (Track C). Caf's page captures selfie + RG/CNH and posts back
 * to our /webhooks/caf endpoint when the user is done — nothing
 * inside the WebView needs to write to our backend directly.
 *
 * We listen for navigation to a "finished" URL the Caf contract
 * defines (usually ?status=completed or similar). Keep the detection
 * loose — Caf has changed this before.
 */
export default function VerificacaoDocumentoScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ url?: string }>();
  const url = typeof params.url === 'string' ? params.url : '';
  const [loading, setLoading] = useState(true);

  if (!url) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Verificação por documento' }} />
        <Text style={{ color: theme.text }}>URL de verificação ausente.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Verificação por documento' }} />
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        // Camera permission is required by the Caf liveness flow.
        // iOS reads NSCameraUsageDescription from Info.plist;
        // Android uses the permission declared in app.json.
        mediaPlaybackRequiresUserAction={false}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => {
          // Heuristic completion detection — Caf redirects to a
          // "thanks" URL with `?status=completed` or similar on
          // success. Pop back so the user lands on the verification
          // screen; the webhook has already flipped the server flag
          // by the time they return.
          if (/status=(completed|done|approved)/.test(state.url)) {
            router.back();
          }
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
