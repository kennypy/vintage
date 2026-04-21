import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import {
  createCollection,
  listCollections,
  removeCollection,
  renameCollection,
  type FavoriteCollection,
} from '../../src/services/favoriteCollections';

export default function CollectionsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<FavoriteCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCollections());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createCollection(newName.trim());
      setNewName('');
      setModalOpen(false);
      await refresh();
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = (col: FavoriteCollection) => {
    Alert.prompt?.(
      'Renomear coleção',
      'Novo nome',
      async (name) => {
        if (!name || !name.trim()) return;
        try {
          await renameCollection(col.id, name.trim());
          await refresh();
        } catch (err) {
          Alert.alert('Erro', String(err).slice(0, 200));
        }
      },
      'plain-text',
      col.name,
    );
  };

  const handleDelete = (col: FavoriteCollection) => {
    Alert.alert(
      'Remover coleção?',
      `Os itens de "${col.name}" voltarão para a pasta padrão. A coleção será removida.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCollection(col.id);
              await refresh();
            } catch (err) {
              Alert.alert('Erro', String(err).slice(0, 200));
            }
          },
        },
      ],
    );
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Minhas coleções</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Nova</Text>
        </TouchableOpacity>
      </View>

      {items.map((col) => (
        <View key={col.id} style={styles.row}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => router.push(`/favorites/collections/${col.id}`)}
          >
            <Text style={styles.rowName}>{col.name}</Text>
            <Text style={styles.rowMeta}>{col._count?.favorites ?? 0} itens</Text>
          </TouchableOpacity>
          {!col.isDefault && (
            <>
              <TouchableOpacity onPress={() => handleRename(col)} style={styles.rowAction}>
                <Ionicons name="create-outline" size={20} color={colors.neutral[600]} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(col)} style={styles.rowAction}>
                <Ionicons name="trash-outline" size={20} color={colors.error[500]} />
              </TouchableOpacity>
            </>
          )}
        </View>
      ))}

      <Modal transparent visible={modalOpen} animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nova coleção</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Festa, Trabalho"
              value={newName}
              onChangeText={setNewName}
              maxLength={64}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalOpen(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} disabled={creating} onPress={handleCreate}>
                <Text style={styles.modalOkText}>{creating ? 'Criando…' : 'Criar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary[600],
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.neutral[0],
    padding: 16, borderRadius: 10, marginBottom: 10,
  },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.neutral[900] },
  rowMeta: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  rowAction: { padding: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.neutral[300], borderRadius: 8, padding: 12, marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalCancel: { padding: 10 },
  modalCancelText: { color: colors.neutral[600], fontWeight: '600' },
  modalOk: { backgroundColor: colors.primary[600], padding: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalOkText: { color: '#fff', fontWeight: '700' },
});
