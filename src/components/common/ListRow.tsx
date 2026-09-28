import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { COLORS, FONTS, SIZES } from '../../constants/theme';

interface ListRowProps {
  icon?: React.ReactNode;
  label: string;
  /** Small text under the label — e.g. "361.5 KB" under "Clear Cache". */
  subtitle?: string;
  onPress?: () => void;
  /** Destructive rows (e.g. a future "Reset app") render label + icon in red. */
  destructive?: boolean;
  /** Hide the trailing chevron — for rows that are informational only. */
  hideChevron?: boolean;
  /** Hairline divider under the row — off for the last row in a group. */
  showDivider?: boolean;
}

/**
 * Icon + label(+subtitle) + chevron row.
 * Used for NOTE's Library menu (Playlists/Artists/Songs/...) and the new
 * Profile screen's Account/Application/Support groups.
 */
export const ListRow: React.FC<ListRowProps> = ({
  icon,
  label,
  subtitle,
  onPress,
  destructive = false,
  hideChevron = false,
  showDivider = true,
}) => {
  const tint = destructive ? COLORS.accent.red : COLORS.text.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={[styles.row, showDivider && styles.divider]}
    >
      {icon && <View style={styles.icon}>{icon}</View>}
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!hideChevron && <ChevronRight size={20} color={COLORS.iconInactive} />}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.hairline,
  },
  icon: {
    width: 28,
    alignItems: 'center',
    marginRight: SIZES.smd,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.text.muted,
    marginTop: 2,
  },
});
