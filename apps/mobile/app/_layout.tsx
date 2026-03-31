import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import { AuthProvider } from '../src/contexts/AuthContext';
import { FavoritesProvider } from '../src/contexts/FavoritesContext';
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext';
import { colors } from '../src/theme/colors';

function AppShell() {
  const { theme, fullScreen } = useTheme();

  // Apply full-screen (hide Android navigation bar) when preference is set
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (fullScreen) {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('inset-swipe');
    } else {
      NavigationBar.setVisibilityAsync('visible');
    }
  }, [fullScreen]);

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
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FavoritesProvider>
          <AppShell />
        </FavoritesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
