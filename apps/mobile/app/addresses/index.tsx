import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { EmptyState } from '../../src/components/EmptyState';
import {
  getAddresses,
  createAddress,
  deleteAddress,
  Address,
  CreateAddressData,
} from '../../src/services/addresses';

const BRAZILIAN_STATES = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
];

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');

  const fetchAddresses = useCallback(async () => {
    try {
      const data = await getAddresses();
      setAddresses(data);
    } catch (_error) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const resetForm = () => {
    setLabel('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('');
    setState('');
    setCep('');
    setShowForm(false);
  };

  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 5) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    return digits;
  };

  const handleAdd = async () => {
    if (!label.trim() || !street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state || !cep.trim()) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios.');
      return;
    }

    const cepDigits = cep.replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      Alert.alert('Erro', 'CEP inválido. Use o formato XXXXX-XXX.');
      return;
    }

    setSaving(true);
    try {
      const data: CreateAddressData = {
        label: label.trim(),
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || undefined,
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state,
        cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
        isDefault: addresses.length === 0,
      };
      const newAddress = await createAddress(data);
      setAddresses((prev) => [...prev, newAddress]);
      resetForm();
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível adicionar o endereço.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addressId: string) => {
    Alert.alert(
      'Excluir endereço',
      'Tem certeza que deseja excluir este endereço?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress(addressId);
              setAddresses((prev) => prev.filter((a) => a.id !== addressId));
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível excluir o endereço.');
            }
          },
        },
      ],
    );
  };

  const renderAddress = ({ item }: { item: Address }) => (
    <View style={styles.addressCard}>
      <View style={styles.addressHeader}>
        <View style={styles.labelRow}>
          <Ionicons name="location" size={18} color={colors.primary[500]} />
          <Text style={styles.addressLabel}>{item.label}</Text>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Padrão</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => handleDelete(item.id)}>
          <Ionicons name="trash-outline" size={20} color={colors.error[500]} />
        </TouchableOpacity>
      </View>
      <Text style={styles.addressText}>
        {item.street}, {item.number}
        {item.complement ? ` - ${item.complement}` : ''}
      </Text>
      <Text style={styles.addressText}>
        {item.neighborhood} - {item.city}/{item.state}
      </Text>
      <Text style={styles.addressCep}>CEP: {item.cep}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {addresses.length === 0 && !showForm ? (
        <EmptyState
          icon="location-outline"
          title="Nenhum endereço cadastrado"
          subtitle="Adicione um endereço para facilitar suas compras"
          actionLabel="Adicionar endereço"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <FlatList
          data={addresses}
          renderItem={renderAddress}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            !showForm ? (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowForm(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary[500]} />
                <Text style={styles.addButtonText}>Adicionar endereço</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {showForm && (
        <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Novo endereço</Text>
            <TouchableOpacity onPress={resetForm}>
              <Ionicons name="close" size={24} color={colors.neutral[600]} />
            </TouchableOpacity>
          </View>

          <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Apelido (ex: Casa, Trabalho)" placeholderTextColor={colors.neutral[400]} />
          <TextInput style={styles.input} value={cep} onChangeText={(v) => setCep(formatCep(v))} placeholder="CEP (XXXXX-XXX)" placeholderTextColor={colors.neutral[400]} keyboardType="numeric" maxLength={9} />
          <TextInput style={styles.input} value={street} onChangeText={setStreet} placeholder="Rua / Avenida" placeholderTextColor={colors.neutral[400]} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.inputSmall]} value={number} onChangeText={setNumber} placeholder="Número" placeholderTextColor={colors.neutral[400]} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.inputLarge]} value={complement} onChangeText={setComplement} placeholder="Complemento (opcional)" placeholderTextColor={colors.neutral[400]} />
          </View>
          <TextInput style={styles.input} value={neighborhood} onChangeText={setNeighborhood} placeholder="Bairro" placeholderTextColor={colors.neutral[400]} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.inputLarge]} value={city} onChangeText={setCity} placeholder="Cidade" placeholderTextColor={colors.neutral[400]} />
            <View style={[styles.input, styles.inputSmall, styles.stateSelector]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {BRAZILIAN_STATES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.stateChip, state === s && styles.stateChipActive]}
                    onPress={() => setState(s)}
                  >
                    <Text style={[styles.stateChipText, state === s && styles.stateChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleAdd}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Salvar endereço</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
  },
  addressCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  defaultBadge: {
    backgroundColor: colors.primary[100],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    color: colors.primary[700],
    fontWeight: '600',
  },
  addressText: {
    fontSize: 14,
    color: colors.neutral[600],
    lineHeight: 20,
  },
  addressCep: {
    fontSize: 13,
    color: colors.neutral[500],
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  addButtonText: {
    fontSize: 15,
    color: colors.primary[500],
    fontWeight: '500',
  },
  formContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
    maxHeight: 400,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  inputSmall: {
    flex: 1,
  },
  inputLarge: {
    flex: 2,
  },
  stateSelector: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  stateChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginHorizontal: 2,
  },
  stateChipActive: {
    backgroundColor: colors.primary[500],
  },
  stateChipText: {
    fontSize: 13,
    color: colors.neutral[600],
    fontWeight: '500',
  },
  stateChipTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: colors.primary[500],
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
