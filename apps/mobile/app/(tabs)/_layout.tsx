import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';

export default function TabLayout() {
  const { theme } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();

  // While auth is loading or user is not authenticated, render nothing.
  // The root layout's useEffect will redirect to login once auth resolves.
  // Returning null here prevents any tab screen from rendering before the
  // redirect fires, closing the content-flash race condition.
  if (isLoading || !isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        {isLoading && <ActivityIndicator color={colors.primary[500]} />}
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: theme.border,
          backgroundColor: theme.card,
        },
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Buscar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Vender',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Mensagens',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
