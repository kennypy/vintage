import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function SellScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.cameraButton}>
          <Ionicons name="camera" size={48} color={colors.primary[600]} />
          <Text style={styles.cameraText}>Tirar foto</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.galleryButton}>
          <Ionicons name="images-outline" size={24} color={colors.primary[600]} />
          <Text style={styles.galleryText}>Escolher da galeria</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Adicione até 20 fotos do seu item.{'\n'}
          Fotos boas vendem mais rápido!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[0] },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  cameraButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.primary[200],
    borderStyle: 'dashed',
  },
  cameraText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[600],
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[200],
    marginBottom: 32,
  },
  galleryText: {
    marginLeft: 8,
    fontSize: 16,
    color: colors.primary[600],
    fontWeight: '500',
  },
  hint: {
    textAlign: 'center',
    color: colors.neutral[400],
    fontSize: 14,
    lineHeight: 22,
  },
});
