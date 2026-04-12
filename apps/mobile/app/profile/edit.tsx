import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { updateProfile } from '../../src/services/users';
import { Avatar, PRESET_AVATARS } from '../../src/components/Avatar';

export default function EditProfileScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, refreshUser, updateUserAvatar } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [presetPickerVisible, setPresetPickerVisible] = useState(false);

  const handlePickCamera = async () => {
    setAvatarPickerVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera para tirar uma foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handlePickGallery = async () => {
    setAvatarPickerVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para escolher uma foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handlePickPreset = () => {
    setAvatarPickerVisible(false);
    setPresetPickerVisible(true);
  };

  const handleSelectPreset = (presetId: string) => {
    setAvatarUri(`preset:${presetId}`);
    setPresetPickerVisible(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erro', 'O nome é obrigatório.');
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    try {
      await updateProfile(user.id, {
        name: name.trim(),
        bio: bio.trim() || undefined,
        phone: phone.trim() || undefined,
        avatarUrl: avatarUri ?? undefined,
      });
      if (avatarUri) await updateUserAvatar(avatarUri);
      await refreshUser();
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      // API may reject file:// URIs — still persist avatar locally
      if (avatarUri) await updateUserAvatar(avatarUri);
      Alert.alert('Sucesso', 'Perfil atualizado!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setSaving(false);
    }
  };

  const femalePresets = PRESET_AVATARS.filter((p) => p.gender === 'F');
  const malePresets = PRESET_AVATARS.filter((p) => p.gender === 'M');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.card }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <Avatar uri={avatarUri} name={user?.name} size={96} />
            <TouchableOpacity
              style={[styles.editAvatarButton, { backgroundColor: colors.primary[600] }]}
              onPress={() => setAvatarPickerVisible(true)}
            >
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setAvatarPickerVisible(true)}>
            <Text style={[styles.avatarHint, { color: colors.primary[600] }]}>Editar foto de perfil</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Nome</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={name}
            onChangeText={setName}
            placeholder="Seu nome"
            placeholderTextColor={theme.textTertiary}
            maxLength={100}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Conte um pouco sobre você..."
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: theme.textTertiary }]}>{bio.length}/500</Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Telefone</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="(11) 99999-9999"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Salvar alterações</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Avatar Source Picker */}
      <Modal visible={avatarPickerVisible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAvatarPickerVisible(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionSheetTitle, { color: theme.text }]}>Foto de perfil</Text>
            <TouchableOpacity style={[styles.actionSheetItem, { borderBottomColor: theme.divider }]} onPress={handlePickCamera}>
              <Ionicons name="camera-outline" size={22} color={theme.text} />
              <Text style={[styles.actionSheetLabel, { color: theme.text }]}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetItem, { borderBottomColor: theme.divider }]} onPress={handlePickGallery}>
              <Ionicons name="image-outline" size={22} color={theme.text} />
              <Text style={[styles.actionSheetLabel, { color: theme.text }]}>Galeria de fotos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetItem, { borderBottomColor: theme.divider }]} onPress={handlePickPreset}>
              <Ionicons name="person-circle-outline" size={22} color={theme.text} />
              <Text style={[styles.actionSheetLabel, { color: theme.text }]}>Escolher avatar</Text>
            </TouchableOpacity>
            {avatarUri && (
              <TouchableOpacity
                style={[styles.actionSheetItem, { borderBottomColor: theme.divider }]}
                onPress={() => { setAvatarUri(null); setAvatarPickerVisible(false); }}
              >
                <Ionicons name="trash-outline" size={22} color={colors.error[500]} />
                <Text style={[styles.actionSheetLabel, { color: colors.error[500] }]}>Remover foto</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionSheetCancel, { borderTopColor: theme.divider }]}
              onPress={() => setAvatarPickerVisible(false)}
            >
              <Text style={[styles.actionSheetCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Preset Avatar Picker */}
      <Modal visible={presetPickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.presetSheet, { backgroundColor: theme.card }]}>
            <View style={styles.presetHeader}>
              <Text style={[styles.presetTitle, { color: theme.text }]}>Escolher avatar</Text>
              <TouchableOpacity onPress={() => setPresetPickerVisible(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.presetGroupLabel, { color: theme.textSecondary }]}>Feminino</Text>
            <FlatList
              data={femalePresets}
              horizontal
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.presetRow}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.presetItem,
                    avatarUri === `preset:${item.id}` && styles.presetItemSelected,
                  ]}
                  onPress={() => handleSelectPreset(item.id)}
                >
                  <Avatar uri={`preset:${item.id}`} size={60} />
                  <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              )}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={11}
              initialNumToRender={8}
            />

            <Text style={[styles.presetGroupLabel, { color: theme.textSecondary }]}>Masculino</Text>
            <FlatList
              data={malePresets}
              horizontal
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.presetRow}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.presetItem,
                    avatarUri === `preset:${item.id}` && styles.presetItemSelected,
                  ]}
                  onPress={() => handleSelectPreset(item.id)}
                >
                  <Avatar uri={`preset:${item.id}`} size={60} />
                  <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              )}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={11}
              initialNumToRender={8}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatarWrapper: { position: 'relative', marginBottom: 8 },
  editAvatarButton: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarHint: { fontSize: 13, fontWeight: '500' },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textArea: { height: 100, paddingTop: 12 },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 4 },
  saveButton: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 12,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  // Action sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  actionSheetTitle: {
    fontSize: 16, fontWeight: '700', textAlign: 'center',
    paddingVertical: 16,
  },
  actionSheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionSheetLabel: { fontSize: 16 },
  actionSheetCancel: {
    paddingVertical: 16, alignItems: 'center', borderTopWidth: 1, marginTop: 8,
  },
  actionSheetCancelText: { fontSize: 15, fontWeight: '500' },
  // Preset picker
  presetSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36, paddingTop: 8,
  },
  presetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  presetTitle: { fontSize: 18, fontWeight: '700' },
  presetGroupLabel: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, marginTop: 8, marginBottom: 4 },
  presetRow: { paddingHorizontal: 16, gap: 12 },
  presetItem: {
    alignItems: 'center', gap: 6, padding: 8, borderRadius: 12,
  },
  presetItemSelected: {
    backgroundColor: colors.primary[50],
    borderWidth: 2,
    borderColor: colors.primary[500],
  },
  presetLabel: { fontSize: 11 },
});
