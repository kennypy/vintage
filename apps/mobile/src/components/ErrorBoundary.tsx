import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. When any child renders throw, we render a friendly
 * fallback instead of crashing the whole navigation tree. `onReset` clears the
 * error state so the user can try again without relaunching the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const message = this.state.error?.message ?? 'Erro desconhecido';
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
          <Text style={styles.title}>Algo deu errado</Text>
          <Text style={styles.desc}>
            Ocorreu um erro inesperado. Tente novamente; se o problema continuar, reinicie o aplicativo.
          </Text>
          <Text style={styles.detail} numberOfLines={5}>{message}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset} accessibilityRole="button">
            <Text style={styles.buttonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 8 },
  desc: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
  detail: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 8 },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
