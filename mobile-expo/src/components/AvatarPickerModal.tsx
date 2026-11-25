import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AVATAR_CHARACTERS,
  AVATAR_PALETTES,
  formatAvatarSpec,
  parseAvatarSpec,
  type AvatarCharacterId,
  type AvatarPaletteId,
} from '../config/avatars';
import type { TranslationDict } from '../utils/errorMessages';
import { PlayerAvatar } from './PlayerAvatar';

interface AvatarPickerModalProps {
  visible: boolean;
  playerName: string;
  initialAvatar: string;
  t: TranslationDict;
  isRTL: boolean;
  onClose: () => void;
  onSave: (nextAvatar: string) => void | Promise<void>;
  onHapticTap?: () => void;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  visible,
  playerName,
  initialAvatar,
  t,
  isRTL,
  onClose,
  onSave,
  onHapticTap,
}) => {
  const parsedInit = parseAvatarSpec(initialAvatar);
  const [selectedChar, setSelectedChar] = useState<AvatarCharacterId>(parsedInit.characterId);
  const [selectedPalette, setSelectedPalette] = useState<AvatarPaletteId>(parsedInit.paletteId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const next = parseAvatarSpec(initialAvatar);
    setSelectedChar(next.characterId);
    setSelectedPalette(next.paletteId);
  }, [visible, initialAvatar]);

  const previewSpec = formatAvatarSpec(selectedChar, selectedPalette);
  const dirText = { writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const) };

  const handleSave = async () => {
    onHapticTap?.();
    setSaving(true);
    try {
      await onSave(previewSpec);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={[styles.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.title, dirText]}>{t.chooseAvatarTitle}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollBody}>
            <View style={styles.previewWrap}>
              <PlayerAvatar name={playerName || 'Player'} paletteId={previewSpec} size="xl" active />
              <Text style={styles.previewName}>
                {playerName.trim() || t.yourNamePlaceholder}
              </Text>
              {(() => {
                const ch = AVATAR_CHARACTERS.find((c) => c.id === selectedChar);
                if (!ch) return null;
                return (
                  <Text style={styles.previewCharLabel}>
                    {ch.emoji} {isRTL ? ch.labelAr : ch.labelEn}
                  </Text>
                );
              })()}
            </View>

            <Text style={[styles.sectionLabel, dirText]}>{t.avatarCharacterLabel}</Text>
            <View style={styles.charGrid}>
              {AVATAR_CHARACTERS.map((ch) => {
                const active = selectedChar === ch.id;
                return (
                  <TouchableOpacity
                    key={ch.id}
                    onPress={() => {
                      onHapticTap?.();
                      setSelectedChar(ch.id);
                    }}
                    style={[styles.charCell, active && styles.charCellActive]}
                  >
                    <Text style={styles.charEmoji}>{ch.emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, dirText]}>{t.avatarColorLabel}</Text>
            <View style={styles.paletteGrid}>
              {AVATAR_PALETTES.map((pal) => {
                const active = selectedPalette === pal.id;
                return (
                  <TouchableOpacity
                    key={pal.id}
                    onPress={() => {
                      onHapticTap?.();
                      setSelectedPalette(pal.id);
                    }}
                    style={[styles.swatchWrap, active && styles.swatchWrapActive]}
                  >
                    <LinearGradient
                      colors={pal.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.swatchFill}
                    >
                      {active && <Text style={styles.swatchCheck}>✓</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>{t.close}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={saving}
              onPress={() => void handleSave()}
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            >
              <Text style={styles.saveBtnText}>{t.saveAvatarBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(35, 26, 21, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: '#FFFDF9',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DDD2C0',
    padding: 18,
    gap: 12,
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#231A15',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#231A15',
  },
  scrollBody: {
    gap: 12,
    paddingBottom: 6,
  },
  previewWrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  previewName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#231A15',
  },
  previewCharLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8B5E3C',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6E5E50',
  },
  charGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  charCell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FBF7F0',
    borderWidth: 1,
    borderColor: '#DDD2C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCellActive: {
    backgroundColor: '#231A15',
    borderColor: '#231A15',
  },
  charEmoji: {
    fontSize: 22,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(35, 26, 21, 0.16)',
  },
  swatchWrapActive: {
    borderWidth: 2.5,
    borderColor: '#231A15',
  },
  swatchFill: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color: '#FFFDF9',
    fontWeight: '800',
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#EFE6D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#231A15',
    fontWeight: '800',
    fontSize: 14,
  },
  saveBtn: {
    flex: 2,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#231A15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FBF7F0',
    fontWeight: '800',
    fontSize: 14,
  },
});
