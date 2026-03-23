import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
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
      </Stack>
    </>
  );
}
