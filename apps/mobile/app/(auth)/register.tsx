import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { TurnstileWebView } from '../../src/components/TurnstileWebView';

type Step = 'account' | 'address' | 'interests';

const INTEREST_OPTIONS = [
  'Moda Feminina', 'Moda Masculina', 'Moda Infantil', 'Calçados',
  'Bolsas e Acessórios', 'Roupas de Academia', 'Roupas de Festa',
  'Jeans', 'Vestidos', 'Casacos', 'Vintage', 'Streetwear',
  'Praia e Verão', 'Lingerie', 'Ternos e Blazers',
];

const STATES_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  // Step tracking
  const [step, setStep] = useState<Step>('account');

  // Account fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  // Birth date is required (18+ check). Kept as ISO yyyy-mm-dd string so
  // it serialises cleanly into RegisterDto.birthDate.
  const [birthDate, setBirthDate] = useState('');

  // Address fields
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const formatCpf = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const formatCep = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, '$1-$2');
  };

  const validateAccount = () => {
    if (!name || !email || !cpf || !password || !birthDate) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos.');
      return false;
    }
    if (password.length < 8) {
      Alert.alert('Senha fraca', 'A senha deve ter no mínimo 8 caracteres.');
      return false;
    }
    // Accept dd/mm/yyyy or yyyy-mm-dd; convert the brazilian form to ISO.
    const iso = birthDate.includes('/')
      ? birthDate.split('/').reverse().join('-')
      : birthDate;
    const birth = new Date(iso);
    if (Number.isNaN(birth.getTime())) {
      Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA.');
      return false;
    }
    const ageYears = (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 18) {
      Alert.alert('Idade mínima', 'Você precisa ter pelo menos 18 anos para criar uma conta.');
      return false;
    }
    return true;
  };

  const validateAddress = () => {
    if (!cep || !street || !number || !neighborhood || !city || !state) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos de endereço (exceto complemento).');
      return false;
    }
    const rawCep = cep.replace(/\D/g, '');
    if (rawCep.length !== 8) {
      Alert.alert('CEP inválido', 'Informe um CEP válido no formato 00000-000.');
      return false;
    }
    return true;
  };

  const handleNextFromAccount = () => {
    if (validateAccount()) setStep('address');
  };

  const handleNextFromAddress = () => {
    if (validateAddress()) setStep('interests');
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const rawCpf = cpf.replace(/\D/g, '');
      const isoBirthDate = birthDate.includes('/')
        ? birthDate.split('/').reverse().join('-')
        : birthDate;
      await signUp(name, email, rawCpf, password, isoBirthDate, { captchaToken });
      // Post-signup walkthrough prompts identity verification while
      // intent is fresh. Users can skip to the feed from there.
      router.replace('/welcome/verify');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível criar sua conta. Verifique os dados e tente novamente.';
      Alert.alert('Erro ao criar conta', message);
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  const stepTitle = step === 'account' ? 'Criar conta' : step === 'address' ? 'Seu endereço' : 'Seus interesses';
  const stepNumber = step === 'account' ? 1 : step === 'address' ? 2 : 3;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>Vintage.br</Text>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.progressDot, n <= stepNumber && styles.progressDotActive]} />
          ))}
        </View>

        <Text style={styles.subtitle}>{stepTitle}</Text>

        {step === 'account' && (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Nome completo"
              placeholderTextColor={colors.neutral[400]}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.neutral[400]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="CPF"
              placeholderTextColor={colors.neutral[400]}
              value={cpf}
              onChangeText={(t) => setCpf(formatCpf(t))}
              keyboardType="numeric"
              maxLength={14}
            />
            <TextInput
              style={styles.input}
              placeholder="Data de nascimento (DD/MM/AAAA)"
              placeholderTextColor={colors.neutral[400]}
              value={birthDate}
              onChangeText={(t) => {
                // Live-format into DD/MM/AAAA as the user types.
                const digits = t.replace(/\D/g, '').slice(0, 8);
                const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
                setBirthDate(parts.join('/'));
              }}
              keyboardType="numeric"
              maxLength={10}
            />
            <TextInput
              style={styles.input}
              placeholder="Senha (mín. 8 caracteres)"
              placeholderTextColor={colors.neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <TouchableOpacity style={styles.button} onPress={handleNextFromAccount}>
              <Text style={styles.buttonText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'address' && (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="CEP (ex: 01310-100)"
              placeholderTextColor={colors.neutral[400]}
              value={cep}
              onChangeText={(t) => setCep(formatCep(t))}
              keyboardType="numeric"
              maxLength={9}
            />
            <TextInput
              style={styles.input}
              placeholder="Rua / Avenida"
              placeholderTextColor={colors.neutral[400]}
              value={street}
              onChangeText={setStreet}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                placeholder="Número"
                placeholderTextColor={colors.neutral[400]}
                value={number}
                onChangeText={setNumber}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="Complemento (opcional)"
                placeholderTextColor={colors.neutral[400]}
                value={complement}
                onChangeText={setComplement}
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Bairro"
              placeholderTextColor={colors.neutral[400]}
              value={neighborhood}
              onChangeText={setNeighborhood}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="Cidade"
                placeholderTextColor={colors.neutral[400]}
                value={city}
                onChangeText={setCity}
              />
              <View style={[styles.input, styles.inputSmall, styles.pickerWrapper]}>
                <ScrollView style={styles.stateScroll} nestedScrollEnabled>
                  {STATES_BR.map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setState(s)}
                      style={[styles.stateOption, state === s && styles.stateOptionSelected]}
                    >
                      <Text style={[styles.stateText, state === s && styles.stateTextSelected]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {state === '' && <Text style={styles.statePlaceholder}>UF</Text>}
              </View>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleNextFromAddress}>
              <Text style={styles.buttonText}>Continuar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('account')}>
              <Ionicons name="arrow-back" size={16} color={colors.neutral[500]} />
              <Text style={styles.backText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'interests' && (
          <View style={styles.form}>
            <Text style={styles.interestsHint}>Escolha o que você mais gosta (opcional):</Text>
            <View style={styles.interestsGrid}>
              {INTEREST_OPTIONS.map((interest) => {
                const selected = selectedInterests.includes(interest);
                return (
                  <TouchableOpacity
                    key={interest}
                    style={[styles.interestChip, selected && styles.interestChipSelected]}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text style={[styles.interestText, selected && styles.interestTextSelected]}>
                      {interest}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TurnstileWebView
              onToken={setCaptchaToken}
              onExpired={() => setCaptchaToken(null)}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Criando conta...' : 'Criar conta'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.skipButton]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.skipText}>Pular e criar conta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => setStep('address')}>
              <Ionicons name="arrow-back" size={16} color={colors.neutral[500]} />
              <Text style={styles.backText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.terms}>
          Ao criar conta, você concorda com os{' '}
          <Text style={styles.termsLink}>Termos de Uso</Text> e a{' '}
          <Text style={styles.termsLink}>Política de Privacidade</Text>.
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.footerLink}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[0] },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40 },
  logo: { fontSize: 32, fontWeight: '700', color: colors.primary[600], textAlign: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 4 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.neutral[200] },
  progressDotActive: { backgroundColor: colors.primary[500], width: 24 },
  subtitle: { fontSize: 16, color: colors.neutral[500], textAlign: 'center', marginTop: 8, marginBottom: 24 },
  form: { gap: 12 },
  input: {
    height: 50, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
  },
  row: { flexDirection: 'row', gap: 8 },
  inputSmall: { width: 80 },
  inputFlex: { flex: 1 },
  pickerWrapper: {
    position: 'relative', overflow: 'hidden', justifyContent: 'center', padding: 0,
  },
  stateScroll: { maxHeight: 50 },
  stateOption: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  stateOptionSelected: { backgroundColor: colors.primary[50] },
  stateText: { fontSize: 14, color: colors.neutral[700] },
  stateTextSelected: { color: colors.primary[600], fontWeight: '600' },
  statePlaceholder: { position: 'absolute', left: 16, color: colors.neutral[400], fontSize: 16 },
  button: {
    height: 50, backgroundColor: colors.primary[600], borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  backText: { color: colors.neutral[500], fontSize: 14 },
  skipButton: { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: colors.neutral[400], fontSize: 14, textDecorationLine: 'underline' },
  interestsHint: { fontSize: 14, color: colors.neutral[500], marginBottom: 4 },
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.neutral[50],
  },
  interestChipSelected: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  interestText: { fontSize: 13, color: colors.neutral[600] },
  interestTextSelected: { color: colors.primary[600], fontWeight: '600' },
  terms: {
    textAlign: 'center', color: colors.neutral[400], fontSize: 12, lineHeight: 18,
    marginTop: 20, paddingHorizontal: 16,
  },
  termsLink: { color: colors.primary[600] },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: colors.neutral[500], fontSize: 14 },
  footerLink: { color: colors.primary[600], fontSize: 14, fontWeight: '600' },
});
