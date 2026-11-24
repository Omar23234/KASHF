import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getAvatarCharacterEmoji,
  getAvatarColors,
  getInitials,
  parseAvatarSpec,
} from '../config/avatars';

interface PlayerAvatarProps {
  name: string;
  paletteId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
  editable?: boolean;
  onPress?: () => void;
}

const SIZE_MAP = {
  xs: { box: 28, radius: 10, emoji: 14, initials: 11 },
  sm: { box: 36, radius: 13, emoji: 18, initials: 13 },
  md: { box: 44, radius: 15, emoji: 22, initials: 15 },
  lg: { box: 56, radius: 18, emoji: 28, initials: 19 },
  xl: { box: 78, radius: 24, emoji: 38, initials: 26 },
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  paletteId,
  size = 'md',
  active = false,
  editable = false,
  onPress,
}) => {
  const dims = SIZE_MAP[size];
  const { characterId } = parseAvatarSpec(paletteId);
  const emoji = getAvatarCharacterEmoji(characterId);
  const colors = getAvatarColors(paletteId);
  const initials = getInitials(name);

  const inner = (
    <View
      style={[
        styles.outerWrap,
        {
          width: dims.box,
          height: dims.box,
          borderRadius: dims.radius,
        },
        active && styles.activeRing,
      ]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderRadius: dims.radius - 1 }]}
      >
        {emoji ? (
          <Text style={{ fontSize: dims.emoji }}>{emoji}</Text>
        ) : (
          <Text style={[styles.initialsText, { fontSize: dims.initials }]}>{initials}</Text>
        )}
      </LinearGradient>
      {editable && (
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>✎</Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
};

const styles = StyleSheet.create({
  outerWrap: {
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(35, 26, 21, 0.16)',
  },
  activeRing: {
    borderWidth: 2.5,
    borderColor: '#8B5E3C',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFFDF9',
    fontWeight: '800',
  },
  editBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#231A15',
    borderWidth: 1.5,
    borderColor: '#FFFDF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    color: '#FFFDF9',
    fontSize: 10,
    fontWeight: '800',
  },
});
