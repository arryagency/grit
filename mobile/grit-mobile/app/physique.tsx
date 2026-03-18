import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
  Modal,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getPhysiquePhotos,
  addPhysiquePhoto,
  deletePhysiquePhoto,
  PhysiquePhoto,
} from '@/utils/storage';
import { schedulePhysiqueReminder } from '@/utils/notifications';
import { COLORS, SPACING, FONT_SIZE, RADIUS } from '@/constants/theme';

const screenWidth = Dimensions.get('window').width;

export default function PhysiqueScreen() {
  const [photos, setPhotos] = useState<PhysiquePhoto[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedA, setSelectedA] = useState<PhysiquePhoto | null>(null);
  const [selectedB, setSelectedB] = useState<PhysiquePhoto | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [pickerError, setPickerError] = useState('');

  useFocusEffect(
    useCallback(() => {
      getPhysiquePhotos().then(setPhotos);
      // Schedule Sunday reminder
      schedulePhysiqueReminder().catch(() => {});
    }, [])
  );

  async function takePhoto() {
    try {
      // Dynamic import so the app doesn't crash if package isn't installed
      const ImagePicker = require('expo-image-picker');

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera permission needed',
          'Allow camera access in Settings to take physique photos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await addPhysiquePhoto(result.assets[0].uri);
        const updated = await getPhysiquePhotos();
        setPhotos(updated);
        setPickerError('');
      }
    } catch (e: any) {
      if (e?.message?.includes('Cannot find module')) {
        setPickerError(
          'expo-image-picker not installed. Run: npx expo install expo-image-picker'
        );
      } else {
        console.log('[GRIT physique] camera error:', e?.message);
      }
    }
  }

  async function pickPhoto() {
    try {
      const ImagePicker = require('expo-image-picker');

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Photos permission needed',
          'Allow photo library access in Settings to import photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await addPhysiquePhoto(result.assets[0].uri);
        const updated = await getPhysiquePhotos();
        setPhotos(updated);
        setPickerError('');
      }
    } catch (e: any) {
      if (e?.message?.includes('Cannot find module')) {
        setPickerError(
          'expo-image-picker not installed. Run: npx expo install expo-image-picker'
        );
      } else {
        console.log('[GRIT physique] picker error:', e?.message);
      }
    }
  }

  function handlePhotoPress(photo: PhysiquePhoto) {
    if (!compareMode) {
      Alert.alert(
        formatPhotoDate(photo.date),
        'What would you like to do?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Compare with another',
            onPress: () => {
              setCompareMode(true);
              setSelectedA(photo);
            },
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => confirmDelete(photo),
          },
        ]
      );
    } else {
      // Compare mode — selecting second photo
      if (selectedA?.id === photo.id) {
        setCompareMode(false);
        setSelectedA(null);
        return;
      }
      setSelectedB(photo);
      setShowCompare(true);
    }
  }

  function confirmDelete(photo: PhysiquePhoto) {
    Alert.alert(
      'Delete photo?',
      `Photo from ${formatPhotoDate(photo.date)} will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePhysiquePhoto(photo.id);
            const updated = await getPhysiquePhotos();
            setPhotos(updated);
          },
        },
      ]
    );
  }

  function cancelCompare() {
    setCompareMode(false);
    setSelectedA(null);
    setSelectedB(null);
    setShowCompare(false);
  }

  function formatPhotoDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function formatPhotoDateShort(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const photoWidth = (screenWidth - SPACING.xl * 2 - SPACING.sm) / 2;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.screenTitle}>Physique</Text>
          <Text style={styles.screenSubtitle}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</Text>
        </View>
        {compareMode ? (
          <TouchableOpacity onPress={cancelCompare}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Compare mode banner */}
      {compareMode && (
        <View style={styles.compareBanner}>
          <Ionicons name="grid-outline" size={16} color={COLORS.accent} />
          <Text style={styles.compareBannerText}>
            Select a second photo to compare with {formatPhotoDateShort(selectedA!.date)}
          </Text>
        </View>
      )}

      {/* Error message */}
      {!!pickerError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
          <Text style={styles.errorText}>{pickerError}</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
            <Ionicons name="camera" size={20} color={COLORS.background} />
            <Text style={styles.photoBtnText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtnAlt} onPress={pickPhoto}>
            <Ionicons name="image-outline" size={20} color={COLORS.accent} />
            <Text style={styles.photoBtnAltText}>Import</Text>
          </TouchableOpacity>
        </View>

        {/* Info card */}
        {photos.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="camera-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Track your transformation</Text>
            <Text style={styles.emptyText}>
              Take a weekly photo every Sunday. Photos are stored privately on your device — never uploaded anywhere.
            </Text>
            <View style={styles.tipsRow}>
              <Tip icon="sunny-outline" text="Same time, same lighting each week" />
              <Tip icon="body-outline" text="Same pose for accurate comparison" />
              <Tip icon="lock-closed-outline" text="Stored locally, fully private" />
            </View>
          </View>
        )}

        {/* Photo grid */}
        {photos.length > 0 && (
          <View style={styles.grid}>
            {photos.map((photo) => {
              const isSelectedA = selectedA?.id === photo.id;
              return (
                <TouchableOpacity
                  key={photo.id}
                  style={[
                    styles.photoCard,
                    { width: photoWidth },
                    isSelectedA && styles.photoCardSelected,
                  ]}
                  onPress={() => handlePhotoPress(photo)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: photo.uri }}
                    style={[styles.photoImage, { width: photoWidth - 2, height: photoWidth * 1.33 - 2 }]}
                    resizeMode="cover"
                  />
                  <View style={styles.photoOverlay}>
                    <Text style={styles.photoDate}>{formatPhotoDateShort(photo.date)}</Text>
                  </View>
                  {isSelectedA && (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>A</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Comparison modal */}
      <Modal visible={showCompare} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.compareModal}>
          <View style={styles.compareHeader}>
            <Text style={styles.compareTitle}>Comparison</Text>
            <TouchableOpacity onPress={cancelCompare} hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {selectedA && selectedB && (
            <View style={styles.compareContent}>
              <View style={styles.compareItem}>
                <Image
                  source={{ uri: selectedA.uri }}
                  style={styles.compareImage}
                  resizeMode="cover"
                />
                <View style={styles.compareLabel}>
                  <Text style={styles.compareLabelText}>BEFORE</Text>
                  <Text style={styles.compareDateText}>{formatPhotoDateShort(selectedA.date)}</Text>
                </View>
              </View>
              <View style={styles.compareItem}>
                <Image
                  source={{ uri: selectedB.uri }}
                  style={styles.compareImage}
                  resizeMode="cover"
                />
                <View style={styles.compareLabel}>
                  <Text style={[styles.compareLabelText, { color: COLORS.accent }]}>AFTER</Text>
                  <Text style={styles.compareDateText}>{formatPhotoDateShort(selectedB.date)}</Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.closeCmpBtn} onPress={cancelCompare}>
            <Text style={styles.closeCmpBtnText}>Done</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Tip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name={icon} size={16} color={COLORS.accent} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  headerCenter: { alignItems: 'center' },
  screenTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  screenSubtitle: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  cancelText: { fontSize: FONT_SIZE.sm, color: COLORS.danger, fontWeight: '700' },
  compareBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + '40',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  compareBannerText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.accent, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255,136,0,0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    padding: SPACING.md,
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.xs, color: COLORS.warning, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  photoBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
  },
  photoBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
  photoBtnAlt: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  photoBtnAltText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.accent },
  // Empty state
  emptyCard: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  tipsRow: { gap: SPACING.sm, width: '100%', marginTop: SPACING.xs },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tipText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  photoCard: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoCardSelected: {
    borderColor: COLORS.accent,
    borderWidth: 3,
  },
  photoImage: {
    borderRadius: RADIUS.md - 1,
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  photoDate: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  selectedBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: COLORS.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.background,
  },
  // Comparison modal
  compareModal: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
  },
  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  compareTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.text },
  compareContent: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  compareItem: {
    flex: 1,
    gap: SPACING.sm,
  },
  compareImage: {
    flex: 1,
    borderRadius: RADIUS.md,
    width: '100%',
  },
  compareLabel: {
    alignItems: 'center',
    gap: 2,
    paddingBottom: SPACING.sm,
  },
  compareLabelText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  compareDateText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  closeCmpBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  closeCmpBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.background },
});
