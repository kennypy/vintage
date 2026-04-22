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
        <Stack.Screen name="conta/verificacao-documento" options={{ title: 'Verificação por documento' }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: 'Esqueci a senha' }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: 'Nova senha' }} />
        <Stack.Screen
          name="(auth)/2fa-challenge"
          options={{ title: 'Verificação em 2 etapas', headerShown: false }}
        />
        <Stack.Screen name="listing/edit/[id]" options={{ title: 'Editar anúncio' }} />
        <Stack.Screen name="dispute/[orderId]" options={{ title: 'Abrir disputa' }} />
        {/* Routes added in later feature batches — Expo Router already
            registers them from the file system, but declaring them here
            keeps header titles (and the presentation mode for modals)
            in pt-BR instead of the default humanised file path. */}
        <Stack.Screen name="returns/index" options={{ title: 'Devoluções' }} />
        <Stack.Screen name="returns/[id]" options={{ title: 'Detalhes da devolução' }} />
        <Stack.Screen name="returns/new" options={{ title: 'Nova devolução', presentation: 'modal' }} />
        <Stack.Screen name="offers/[id]" options={{ title: 'Detalhes da oferta' }} />
        <Stack.Screen name="bundles/index" options={{ title: 'Pacotes' }} />
        <Stack.Screen name="bundles/[id]" options={{ title: 'Detalhes do pacote' }} />
        <Stack.Screen name="saved-searches/index" options={{ title: 'Buscas salvas' }} />
        <Stack.Screen name="favorites/collections" options={{ title: 'Coleções' }} />
        <Stack.Screen name="price-alerts/index" options={{ title: 'Alertas de preço' }} />
        <Stack.Screen name="orders/retry-payment" options={{ title: 'Tentar pagamento', presentation: 'modal' }} />
        <Stack.Screen name="seller/dashboard" options={{ title: 'Painel do vendedor' }} />
        <Stack.Screen name="report/[targetType]/[targetId]" options={{ title: 'Denunciar', presentation: 'modal' }} />
        <Stack.Screen name="support/[id]" options={{ title: 'Ticket de suporte' }} />
        <Stack.Screen name="users/[id]/followers" options={{ title: 'Seguidores' }} />
        <Stack.Screen name="users/[id]/following" options={{ title: 'Seguindo' }} />
        <Stack.Screen name="welcome/onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="welcome/verify" options={{ title: 'Verificar conta' }} />
        <Stack.Screen name="legal/termos" options={{ title: 'Termos de Uso' }} />
        <Stack.Screen name="legal/privacidade" options={{ title: 'Política de Privacidade' }} />
        <Stack.Screen name="legal/diretrizes-comunidade" options={{ title: 'Diretrizes da comunidade' }} />
        <Stack.Screen name="legal/sobre" options={{ title: 'Sobre' }} />
        <Stack.Screen name="legal/press" options={{ title: 'Imprensa' }} />
        <Stack.Screen name="conta/alterar-email" options={{ title: 'Alterar email' }} />
        <Stack.Screen name="conta/notificacoes" options={{ title: 'Notificações' }} />
        <Stack.Screen name="conta/payout-methods" options={{ title: 'Métodos de recebimento' }} />
        <Stack.Screen name="conta/cpf" options={{ title: 'Verificar CPF' }} />
        <Stack.Screen name="conta/blocked-users" options={{ title: 'Usuários bloqueados' }} />
        <Stack.Screen name="conta/indicacoes" options={{ title: 'Indique e ganhe' }} />
        <Stack.Screen name="conta/suporte" options={{ title: 'Suporte' }} />
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
