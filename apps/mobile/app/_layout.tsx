import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, View, ActivityIndicator, AppState, type AppStateStatus } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { FavoritesProvider } from '../src/contexts/FavoritesContext';
import { FeatureFlagsProvider } from '../src/contexts/FeatureFlagsContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { PostHogBootstrap } from '../src/components/PostHogBootstrap';
import { colors } from '../src/theme/colors';

function AppShell() {
  const { theme, fullScreen } = useTheme();
  const { isAuthenticated, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // When the app returns to the foreground, revalidate auth state so a token
  // that expired while backgrounded forces the user back to login instead of
  // leaving them with broken API calls.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active' && isAuthenticated) {
        refreshUser().catch(() => { /* token refresh handled by apiFetch */ });
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, refreshUser]);

  const inAuthGroup = segments[0] === '(auth)';

  // Screens that guests may view without signing in
  const isGuestAllowed =
    segments[0] === '(tabs)' &&
    (segments[1] === 'index' || segments[1] === 'search');

  // Listing detail is also guest-accessible
  const isListingDetail = segments[0] === 'listing';
  const isSellerProfile = segments[0] === 'seller';

  // When auth state settles and user lands somewhere they shouldn't be, redirect.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !inAuthGroup && !isGuestAllowed && !isListingDetail && !isSellerProfile) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading, inAuthGroup, isGuestAllowed, isListingDetail, isSellerProfile, router]);

  // Full-screen (hide Android navigation bar) when the user opts in.
  // Expo SDK 54+ enables edge-to-edge by default, and setBehaviorAsync then
  // warns + no-ops; only invoke these when the user actually toggled on,
  // and swallow any runtime error.
  useEffect(() => {
    if (Platform.OS !== 'android' || !fullScreen) return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    NavigationBar.setBehaviorAsync('inset-swipe').catch(() => {});
  }, [fullScreen]);

  // Show a spinner while auth state is determined.
  // The Stack is NOT rendered during this window so there is nothing to flash.
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  // After loading, always render the Stack so every route is registered in the
  // navigator. Hiding the Stack causes "route not found" errors when router.replace
  // fires (e.g. on logout). The (tabs) layout guards against showing tab content
  // while unauthenticated — see app/(tabs)/_layout.tsx.
  const navTheme = {
    ...(theme.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.isDark ? DarkTheme : DefaultTheme).colors,
      background: theme.background,
      card: theme.header,
      text: theme.text,
      border: theme.border,
      primary: colors.primary[500],
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <PostHogBootstrap />
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.header },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
        <Stack.Screen name="listing/[id]" options={{ title: 'Detalhes do anúncio' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'modal' }} />
        <Stack.Screen name="orders/index" options={{ title: 'Meus pedidos' }} />
        <Stack.Screen name="orders/[id]" options={{ title: 'Detalhes do pedido' }} />
        <Stack.Screen name="offers/index" options={{ title: 'Ofertas' }} />
        <Stack.Screen name="notifications/index" options={{ title: 'Notificações' }} />
        <Stack.Screen name="wallet/index" options={{ title: 'Carteira' }} />
        <Stack.Screen name="seller/[id]" options={{ title: 'Perfil do vendedor' }} />
        <Stack.Screen name="conversation/[id]" options={{ title: 'Conversa' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Editar perfil' }} />
        <Stack.Screen name="addresses/index" options={{ title: 'Endereços' }} />
        <Stack.Screen name="favorites/index" options={{ title: 'Favoritos' }} />
        <Stack.Screen name="my-listings/index" options={{ title: 'Meus anúncios' }} />
        <Stack.Screen name="reviews/[userId]" options={{ title: 'Avaliações' }} />
        <Stack.Screen name="reviews/write" options={{ title: 'Escrever avaliação', presentation: 'modal' }} />
        <Stack.Screen name="promotions/megaphone" options={{ title: 'Megafone' }} />
        <Stack.Screen name="promotions/boost" options={{ title: 'Impulsionar anúncio' }} />
        <Stack.Screen name="promotions/highlight" options={{ title: 'Destaque da loja' }} />
        <Stack.Screen name="conta/verificacao" options={{ title: 'Verificação' }} />
        <Stack.Screen name="conta/configuracoes" options={{ title: 'Configurações' }} />
        <Stack.Screen name="conta/ajuda" options={{ title: 'Ajuda' }} />
        <Stack.Screen name="conta/alterar-senha" options={{ title: 'Alterar senha' }} />
        <Stack.Screen name="conta/seguranca" options={{ title: 'Segurança' }} />
        <Stack.Screen name="conta/deletar-conta" options={{ title: 'Excluir conta' }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: 'Esqueci a senha' }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: 'Nova senha' }} />
        <Stack.Screen name="listing/edit/[id]" options={{ title: 'Editar anúncio' }} />
        <Stack.Screen name="dispute/[orderId]" options={{ title: 'Abrir disputa' }} />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <FeatureFlagsProvider>
            <FavoritesProvider>
              <AppShell />
            </FavoritesProvider>
          </FeatureFlagsProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
