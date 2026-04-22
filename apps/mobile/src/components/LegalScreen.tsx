import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface Section {
  title: string;
  body: string | ReactNode;
}

interface LegalScreenProps {
  title: string;
  intro?: string;
  sections: Section[];
  footer?: ReactNode;
}

/**
 * Shared layout for static/legal content on mobile. Mirrors the web
 * pages under /sobre, /termos, /privacidade, /diretrizes-comunidade, /press.
 * Parity is required by CLAUDE.md — copy should track the web source of truth.
 */
export function LegalScreen({ title, intro, sections, footer }: LegalScreenProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}

      {sections.map((s, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.sectionTitle}>{s.title}</Text>
          {typeof s.body === 'string' ? (
            <Text style={styles.body}>{s.body}</Text>
          ) : (
            s.body
          )}
        </View>
      ))}

      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  content: { padding: 20, paddingBottom: 40 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.neutral[900],
    marginBottom: 12,
  },
  intro: {
    fontSize: 15,
    color: colors.neutral[700],
    lineHeight: 22,
    marginBottom: 24,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.neutral[900],
    marginBottom: 8,
  },
  body: { fontSize: 14, color: colors.neutral[700], lineHeight: 22 },
});
