import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';

const { width } = Dimensions.get('window');

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'shirt-outline',
    title: 'Moda de segunda mão, com segurança',
    body: 'Compre e venda peças únicas de outras pessoas. Pagamento protegido até a confirmação da entrega.',
  },
  {
    icon: 'cash-outline',
    title: 'Venda sem taxas mensais',
    body: 'Anuncie gratuitamente. Cobramos só uma pequena taxa de proteção ao comprador.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Identidade verificada, confiança real',
    body: 'O selo CPF Verificado mostra para quem você está vendendo ou comprando. Menos fraudes, mais tranquilidade.',
  },
];

/**
 * Fresh-install onboarding shown once post-signup before routing to
 * the verify-CPF step. Swipeable carousel with Skip in the header and
 * a Continue button on the final slide.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const finish = () => router.replace('/welcome/verify');

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      finish();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipText}>Pular</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={56} color={colors.primary[600]} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, index === i && styles.dotActive]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.nextBtn, { marginBottom: insets.bottom + 16 }]}
        onPress={handleNext}
      >
        <Text style={styles.nextText}>
          {index === SLIDES.length - 1 ? 'Começar' : 'Próximo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16 },
  skipBtn: { padding: 8 },
  skipText: { color: colors.neutral[500], fontSize: 15 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24, fontWeight: '700',
    color: colors.neutral[900], textAlign: 'center', marginBottom: 12,
  },
  body: {
    fontSize: 15, color: colors.neutral[600],
    textAlign: 'center', lineHeight: 22,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 20 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.neutral[300],
  },
  dotActive: { backgroundColor: colors.primary[600], width: 24 },
  nextBtn: {
    marginHorizontal: 24,
    backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
