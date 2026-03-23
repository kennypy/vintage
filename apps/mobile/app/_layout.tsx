import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#111827',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="listing/[id]"
          options={{ title: 'Detalhes do anúncio' }}
        />
        <Stack.Screen
          name="checkout"
          options={{ title: 'Checkout', presentation: 'modal' }}
        />
        <Stack.Screen
          name="orders/index"
          options={{ title: 'Meus pedidos' }}
        />
        <Stack.Screen
          name="orders/[id]"
          options={{ title: 'Detalhes do pedido' }}
        />
        <Stack.Screen
          name="offers/index"
          options={{ title: 'Ofertas' }}
        />
        <Stack.Screen
          name="notifications/index"
          options={{ title: 'Notificações' }}
        />
        <Stack.Screen
          name="wallet/index"
          options={{ title: 'Carteira' }}
        />
        <Stack.Screen
          name="seller/[id]"
          options={{ title: 'Perfil do vendedor' }}
        />
        <Stack.Screen
          name="conversation/[id]"
          options={{ title: 'Conversa' }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{ title: 'Editar perfil' }}
        />
        <Stack.Screen
          name="addresses/index"
          options={{ title: 'Endereços' }}
        />
        <Stack.Screen
          name="favorites/index"
          options={{ title: 'Favoritos' }}
        />
        <Stack.Screen
          name="my-listings/index"
          options={{ title: 'Meus anúncios' }}
        />
        <Stack.Screen
          name="reviews/[userId]"
          options={{ title: 'Avaliações' }}
        />
        <Stack.Screen
          name="reviews/write"
          options={{ title: 'Escrever avaliação', presentation: 'modal' }}
        />
      </Stack>
    </AuthProvider>
  );
}
